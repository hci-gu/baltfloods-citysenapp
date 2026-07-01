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
import { Observable, Subscription } from 'rxjs';
import { LeafletHeatmapRenderer } from './leaflet-heatmap-renderer';
import { LeafletMarkerRenderer } from './leaflet-marker-renderer';
import { MapIconLoaderService } from './map-icon-loader.service';
import { MapBounds, Marker } from './map.models';

export type { MapBounds, Marker } from './map.models';

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
  private readonly heatmapRenderer = new LeafletHeatmapRenderer();
  private readonly markerRenderer: LeafletMarkerRenderer;
  private centerSubscription: Subscription | null = null;
  private latestCenter: LatLong | null = null;

  public constructor(mapIconLoader: MapIconLoaderService) {
    this.markerRenderer = new LeafletMarkerRenderer(
      mapIconLoader,
      this.heatmapRenderer,
    );
  }

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
    this.markerRenderer.clear(this.map);
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
    this.markerRenderer.renderMarkers(this.map, newMarkers, (location) =>
      this.markerClick.emit(location),
    );
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
