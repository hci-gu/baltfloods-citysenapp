import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChange,
  SimpleChanges,
} from '@angular/core';
import { LatLong } from '@core/models/location';
import { environment } from '@environments/environment';
import * as leaflet from 'leaflet';
import { isEqual } from 'lodash-es';
import { Observable, Subscription, firstValueFrom, shareReplay } from 'rxjs';

export interface Marker {
  location: LatLong;
  color?: string;
  icon?: string;
  active?: boolean;
  count?: number;
  displayMode?: 'default' | 'heatmap' | 'circle';
  heatIntensity?: number;
}

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
  zoom?: number;
}

@Component({
  standalone: true,
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() public center$: Observable<LatLong> | null = null;
  @Input() public markers: Marker[] = [];

  @Output() public markerClick = new EventEmitter<LatLong>();
  @Output() public mapClick = new EventEmitter<LatLong>();
  @Output() public mapCenterChange = new EventEmitter<LatLong>();
  @Output() public mapBoundsChange = new EventEmitter<MapBounds>();

  public map: leaflet.Map | undefined;

  private readonly zoom = 13;
  private centerSubscription: Subscription | null = null;
  private heatLayer: leaflet.HeatLayer | null = null;
  private heatLayerLoadPromise: Promise<boolean> | null = null;
  private markerRenderSequence = 0;
  private readonly renderedMarkerLayers = new Map<string, leaflet.Marker>();
  private readonly renderedMarkerSnapshots = new Map<string, Marker>();
  private renderedHeatmapMarkers: Marker[] = [];
  private markerSvg$?: Observable<string>;
  private readonly iconSvgCache = new Map<string, Observable<string>>();
  private latestCenter: LatLong | null = null;

  public constructor(private readonly http: HttpClient) {}

  public ngAfterViewInit(): void {
    setTimeout(() => {
      this.initialiseMap();
      this.initialiseMarkers();
    });
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['markers']) {
      this.renderMarkers(changes['markers'].currentValue);
    }

    if (changes['center$']) {
      this.subscribeToCenterObservable(changes['center$'].currentValue);
    }
  }

  public ngOnDestroy(): void {
    this.centerSubscription?.unsubscribe();
    this.destroyMap();
  }

  private initialiseMap(): void {
    this.map = leaflet
      .map('map-host', {
        zoomControl: false,
        attributionControl: false,
      })
      .on('click', this.onClickMap.bind(this))
      .on('moveend', this.onMoveEnd.bind(this))
      .setView(
        new leaflet.LatLng(...(environment.defaultLocation as LatLong)),
        this.zoom,
      );

    if (this.latestCenter) {
      this.applyCenter(this.latestCenter);
    }

    leaflet
      .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 0,
        maxZoom: 20,
      })
      .addTo(this.map);
  }

  private initialiseMarkers(): void {
    this.ngOnChanges({ markers: new SimpleChange([], this.markers, true) });
    this.emitCurrentViewport();
  }

  private destroyMap(): void {
    this.clearMarkers();
    this.map?.off();
    this.map?.remove();
  }

  private subscribeToCenterObservable(center$: Observable<LatLong>): void {
    this.centerSubscription?.unsubscribe();
    // centerSubscription gets unsubscribed in ngOnDestroy
    this.centerSubscription =
      center$.subscribe((center) => {
        this.latestCenter = center;
        this.applyCenter(center);
      }) ?? null;
  }

  private applyCenter(center: LatLong): void {
    const currentZoom = this.map?.getZoom() ?? this.zoom;
    const minimumZoom = 15;
    const zoom = currentZoom < minimumZoom ? minimumZoom : currentZoom;

    this.map?.setView(new leaflet.LatLng(...center), zoom);
  }

  private renderMarkers(newMarkers: Marker[]): void {
    const renderSequence = ++this.markerRenderSequence;
    const heatmapMarkers = newMarkers.filter(
      (marker) => marker.displayMode === 'heatmap',
    );
    const defaultMarkers = newMarkers.filter(
      (marker) => marker.displayMode !== 'heatmap',
    );

    if (!isEqual(heatmapMarkers, this.renderedHeatmapMarkers)) {
      this.removeHeatLayer();
      this.renderedHeatmapMarkers = [];

      if (heatmapMarkers.length > 0) {
        this.renderedHeatmapMarkers = this.copyMarkers(heatmapMarkers);
        void this.renderHeatLayer(heatmapMarkers, renderSequence);
      }
    }

    this.renderDefaultMarkers(defaultMarkers, renderSequence);
  }

  private renderDefaultMarkers(
    markers: Marker[],
    renderSequence: number,
  ): void {
    const nextMarkerKeys = new Set(
      markers.map((marker) => this.getMarkerKey(marker)),
    );

    Array.from(this.renderedMarkerLayers.keys()).forEach((key) => {
      if (this.renderedMarkerSnapshots.get(key)?.displayMode === 'heatmap') {
        return;
      }

      if (!nextMarkerKeys.has(key)) {
        this.removeMarkerLayer(key);
      }
    });

    markers.forEach((marker) => {
      const markerKey = this.getMarkerKey(marker);
      const existingSnapshot = this.renderedMarkerSnapshots.get(markerKey);

      if (existingSnapshot && isEqual(existingSnapshot, marker)) {
        return;
      }

      void this.upsertMarker(marker, markerKey, renderSequence);
    });
  }

  private removeHeatLayer(): void {
    if (this.heatLayer && this.map?.hasLayer(this.heatLayer)) {
      this.map.removeLayer(this.heatLayer);
    }
    this.heatLayer = null;

    Array.from(this.renderedMarkerLayers.keys()).forEach((key) => {
      if (this.renderedMarkerSnapshots.get(key)?.displayMode === 'heatmap') {
        this.removeMarkerLayer(key);
      }
    });
  }

  private removeMarkerLayer(markerKey: string): void {
    const layer = this.renderedMarkerLayers.get(markerKey);
    if (layer && this.map?.hasLayer(layer)) {
      layer.remove();
    }

    this.renderedMarkerLayers.delete(markerKey);
    this.renderedMarkerSnapshots.delete(markerKey);
  }

  private clearMarkers(): void {
    this.removeHeatLayer();
    this.renderedHeatmapMarkers = [];

    Array.from(this.renderedMarkerLayers.keys()).forEach((key) =>
      this.removeMarkerLayer(key),
    );
  }

  private async upsertMarker(
    marker: Marker,
    markerKey: string,
    renderSequence: number,
  ): Promise<void> {
    const divIcon =
      marker.displayMode === 'circle'
        ? this.getCircleMarkerDivIcon(marker)
        : await this.getMarkerDivIcon(marker);

    if (!this.map || renderSequence !== this.markerRenderSequence) {
      return;
    }

    const existingLayer = this.renderedMarkerLayers.get(markerKey);
    if (existingLayer) {
      existingLayer.setLatLng(new leaflet.LatLng(...marker.location));
      existingLayer.setIcon(divIcon);
      this.renderedMarkerSnapshots.set(markerKey, this.copyMarker(marker));
      return;
    }

    const layer = leaflet.marker(new leaflet.LatLng(...marker.location), {
      icon: divIcon,
      ...(marker.displayMode === 'circle'
        ? {
            interactive: false,
            keyboard: false,
            zIndexOffset: -1000,
          }
        : {}),
    });

    if (marker.displayMode !== 'circle') {
      layer.on('click', this.onClickMarker.bind(this));
    }

    layer.addTo(this.map);
    this.renderedMarkerLayers.set(markerKey, layer);
    this.renderedMarkerSnapshots.set(markerKey, this.copyMarker(marker));
  }

  private getMarkerKey(marker: Marker): string {
    return `${marker.displayMode ?? 'default'}:${marker.location[0]}:${marker.location[1]}`;
  }

  private copyMarkers(markers: Marker[]): Marker[] {
    return markers.map((marker) => this.copyMarker(marker));
  }

  private copyMarker(marker: Marker): Marker {
    return {
      ...marker,
      location: [...marker.location] as LatLong,
    };
  }

  private async renderMarker(marker: Marker): Promise<void> {
    const markerKey = this.getMarkerKey(marker);
    await this.upsertMarker(marker, markerKey, this.markerRenderSequence);
  }

  private async renderHeatLayer(
    markers: Marker[],
    renderSequence: number,
  ): Promise<void> {
    if (!this.map || markers.length === 0) {
      return;
    }

    const hasHeatLayerFactory = await this.ensureHeatLayerFactory();
    if (renderSequence !== this.markerRenderSequence || !this.map) {
      return;
    }

    if (!hasHeatLayerFactory) {
      markers.forEach((marker) => void this.renderMarker(marker));
      return;
    }

    const heatPoints: Array<[number, number, number]> = markers.map(
      (marker) => [
        marker.location[0],
        marker.location[1],
        Math.max(0.05, Math.min(marker.heatIntensity ?? 0.2, 1)),
      ],
    );

    const heatLayerFactory = (
      leaflet as unknown as {
        heatLayer: (
          latlngs: Array<[number, number, number]>,
          options?: leaflet.HeatMapOptions,
        ) => leaflet.HeatLayer;
      }
    ).heatLayer;

    this.heatLayer = heatLayerFactory(heatPoints, {
      radius: 30,
      blur: 22,
      minOpacity: 0.35,
      maxZoom: 18,
      gradient: {
        0.2: '#0ea5e9',
        0.4: '#22c55e',
        0.6: '#facc15',
        0.8: '#f97316',
        1.0: '#dc2626',
      },
    }).addTo(this.map);
  }

  private async ensureHeatLayerFactory(): Promise<boolean> {
    if (this.hasHeatLayerFactory()) {
      return true;
    }

    if (!this.heatLayerLoadPromise) {
      (globalThis as { L?: typeof leaflet }).L = leaflet;
      this.heatLayerLoadPromise = import('leaflet.heat')
        .then(() => this.hasHeatLayerFactory())
        .catch(() => false);
    }

    return this.heatLayerLoadPromise;
  }

  private hasHeatLayerFactory(): boolean {
    return (
      typeof (
        leaflet as unknown as {
          heatLayer?: unknown;
        }
      ).heatLayer === 'function'
    );
  }

  private async getMarkerDivIcon(marker: Marker): Promise<leaflet.DivIcon> {
    const { color, active, icon, count } = marker;
    const markerSvg = await firstValueFrom(this.getMarkerSvg());

    const fillColor = color ?? '#275D38';
    const strokeColor = active ? '#275D38' : fillColor;
    const styledMarkerSvg = markerSvg
      .replace('currentColor', fillColor)
      .replace('strokeColor', strokeColor);

    let iconSvg = '';
    if (icon) {
      iconSvg = await firstValueFrom(this.getIconSvg(icon));
    }

    const svg = `
        <div style="position: relative;">
          ${styledMarkerSvg}
          ${iconSvg}
          ${
            count && count > 1
              ? `<span class="marker-count-badge">${count}</span>`
              : ''
          }
        </div>
      `;

    return leaflet.divIcon({
      html: svg,
      ...this.getMarkerIconProperties(active),
    });
  }

  private getMarkerSvg(): Observable<string> {
    if (!this.markerSvg$) {
      this.markerSvg$ = this.http
        .get('/assets/icons/marker.svg', { responseType: 'text' })
        .pipe(shareReplay(1));
    }

    return this.markerSvg$;
  }

  private getIconSvg(icon: string): Observable<string> {
    const cachedIconSvg = this.iconSvgCache.get(icon);
    if (cachedIconSvg) {
      return cachedIconSvg;
    }

    const iconSvg$ = this.http
      .get(`/assets/icons/${icon}`, { responseType: 'text' })
      .pipe(shareReplay(1));
    this.iconSvgCache.set(icon, iconSvg$);
    return iconSvg$;
  }

  private getCircleMarkerDivIcon(marker: Marker): leaflet.DivIcon {
    const fillColor = marker.color ?? '#2563eb';

    return leaflet.divIcon({
      html: `<span class="location-dot" style="background-color: ${fillColor};"></span>`,
      iconAnchor: [6, 6],
      iconSize: [12, 12],
      className: 'location-dot-marker',
    });
  }

  private getMarkerIconProperties(active: boolean | undefined): {
    iconAnchor: leaflet.PointExpression;
    iconSize: leaflet.PointExpression;
    className: string;
  } {
    const size = (active ? [44, 53] : [33, 40]) as leaflet.PointExpression;
    const anchor = (active ? [22, 53] : [16.5, 40]) as leaflet.PointExpression;
    const className = active ? 'active' : '';

    return { iconAnchor: anchor, iconSize: size, className };
  }

  private onClickMarker(e: leaflet.LeafletMouseEvent): void {
    const { lat, lng } = e.latlng;
    this.markerClick.emit([lat, lng]);
  }

  private onClickMap(e: leaflet.LeafletMouseEvent): void {
    const { lat, lng } = e.latlng;
    this.mapClick.emit([lat, lng]);
  }

  private onMoveEnd(): void {
    this.emitCurrentViewport();
  }

  private emitCurrentViewport(): void {
    const center = this.map?.getCenter();
    const bounds = this.map?.getBounds();

    if (center) {
      this.mapCenterChange.emit([center.lat, center.lng]);
    }

    if (bounds) {
      this.mapBoundsChange.emit({
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
        zoom: this.map?.getZoom(),
      });
    }
  }
}
