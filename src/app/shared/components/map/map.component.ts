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
import { isSameLocation } from '../../utils/location-utils';
import * as leaflet from 'leaflet';
import { isEqual } from 'lodash-es';
import { Observable, Subscription, firstValueFrom } from 'rxjs';

export interface Marker {
  location: LatLong;
  color?: string;
  icon?: string;
  active?: boolean;
  displayMode?: 'default' | 'heatmap';
  heatIntensity?: number;
}

export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
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
      const { previousValue, currentValue } = changes['markers'];
      this.renderMarkers(previousValue ?? [], currentValue);
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

  private getMarkersToAdd(
    previousMarkers: Marker[],
    newMarkers: Marker[],
  ): Marker[] {
    return newMarkers.filter(
      (marker) =>
        !previousMarkers.some((prevMarker) =>
          isSameLocation(marker.location, prevMarker.location),
        ),
    );
  }

  private getMarkersToRemove(
    previousMarkers: Marker[],
    newMarkers: Marker[],
  ): Marker[] {
    return previousMarkers.filter(
      (prevMarker) =>
        !newMarkers.some((marker) =>
          isSameLocation(marker.location, prevMarker.location),
        ),
    );
  }

  private getMarkersToChange(
    previousMarkers: Marker[],
    newMarkers: Marker[],
  ): Marker[] {
    return newMarkers.filter((newMarker) => {
      const previousMarker = previousMarkers.find((marker) =>
        isSameLocation(marker.location, newMarker.location),
      );
      return previousMarker && !isEqual(newMarker, previousMarker);
    });
  }

  private renderMarkers(previousMarkers: Marker[], newMarkers: Marker[]): void {
    const renderSequence = ++this.markerRenderSequence;
    this.clearMarkers();
    if (newMarkers.length === 0) {
      return;
    }

    const heatmapMarkers = newMarkers.filter(
      (marker) => marker.displayMode === 'heatmap',
    );
    const defaultMarkers = newMarkers.filter(
      (marker) => marker.displayMode !== 'heatmap',
    );

    if (heatmapMarkers.length > 0) {
      void this.renderHeatLayer(heatmapMarkers, renderSequence);
    }

    defaultMarkers.forEach(this.renderMarker.bind(this));
  }

  private clearMarkers(): void {
    if (this.heatLayer && this.map?.hasLayer(this.heatLayer)) {
      this.map.removeLayer(this.heatLayer);
    }
    this.heatLayer = null;

    this.map?.eachLayer((layer) => {
      if (layer instanceof leaflet.Marker || layer instanceof leaflet.CircleMarker) {
        layer.remove();
      }
    });
  }

  private updateMarker(marker: Marker): void {
    this.map?.eachLayer(async (layer) => {
      if (layer instanceof leaflet.Marker) {
        const { lat, lng } = layer.getLatLng();

        if (isSameLocation(marker.location, [lat, lng])) {
          const divIcon = await this.getMarkerDivIcon(marker);
          layer.setIcon(divIcon);
        }
      }
    });
  }

  private async renderMarker(marker: Marker): Promise<void> {
    const { location } = marker;

    if (this.map) {
      const divIcon = await this.getMarkerDivIcon(marker);
      leaflet
        .marker(new leaflet.LatLng(...location), {
          icon: divIcon,
        })
        .on('click', this.onClickMarker.bind(this))
        .addTo(this.map);
    }
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

    const heatPoints: Array<[number, number, number]> = markers.map((marker) => [
      marker.location[0],
      marker.location[1],
      Math.max(0.05, Math.min(marker.heatIntensity ?? 0.2, 1)),
    ]);

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
    const { color, active, icon } = marker;
    const markerSvg = await firstValueFrom(
      this.http.get('/assets/icons/marker.svg', { responseType: 'text' }),
    );

    const fillColor = color ?? '#275D38';
    const strokeColor = active ? '#275D38' : fillColor;
    const styledMarkerSvg = markerSvg
      .replace('currentColor', fillColor)
      .replace('strokeColor', strokeColor);

    let iconSvg = '';
    if (icon) {
      iconSvg = await firstValueFrom(
        this.http.get(`/assets/icons/${icon}`, { responseType: 'text' }),
      );
    }

    const svg = `
        <div style="position: relative;">
          ${styledMarkerSvg}
          ${iconSvg}
        </div>
      `;

    return leaflet.divIcon({
      html: svg,
      ...this.getMarkerIconProperties(active),
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
      });
    }
  }
}
