import { LatLong } from '@core/models/location';
import * as leaflet from 'leaflet';
import { isEqual } from 'lodash-es';
import { LeafletHeatmapRenderer } from './leaflet-heatmap-renderer';
import { MapIconLoaderService } from './map-icon-loader.service';
import { Marker } from './map.models';

export class LeafletMarkerRenderer {
  private markerRenderSequence = 0;
  private readonly renderedMarkerLayers = new Map<string, leaflet.Marker>();
  private readonly renderedMarkerSnapshots = new Map<string, Marker>();
  private renderedHeatmapMarkers: Marker[] = [];

  public constructor(
    private readonly mapIconLoader: MapIconLoaderService,
    private readonly heatmapRenderer: LeafletHeatmapRenderer,
  ) {}

  public renderMarkers(
    map: leaflet.Map | undefined,
    newMarkers: Marker[],
    onMarkerClick: (location: LatLong) => void,
  ): void {
    const renderSequence = ++this.markerRenderSequence;
    const heatmapMarkers = newMarkers.filter(
      (marker) => marker.displayMode === 'heatmap',
    );
    const defaultMarkers = newMarkers.filter(
      (marker) => marker.displayMode !== 'heatmap',
    );

    if (!isEqual(heatmapMarkers, this.renderedHeatmapMarkers)) {
      this.removeHeatLayer(map);
      this.renderedHeatmapMarkers = [];

      if (heatmapMarkers.length > 0) {
        this.renderedHeatmapMarkers = this.copyMarkers(heatmapMarkers);
        void this.renderHeatLayer(
          map,
          heatmapMarkers,
          renderSequence,
          onMarkerClick,
        );
      }
    }

    this.renderDefaultMarkers(
      map,
      defaultMarkers,
      renderSequence,
      onMarkerClick,
    );
  }

  public clear(map: leaflet.Map | undefined): void {
    this.removeHeatLayer(map);
    this.renderedHeatmapMarkers = [];

    Array.from(this.renderedMarkerLayers.keys()).forEach((key) =>
      this.removeMarkerLayer(map, key),
    );
  }

  private renderDefaultMarkers(
    map: leaflet.Map | undefined,
    markers: Marker[],
    renderSequence: number,
    onMarkerClick: (location: LatLong) => void,
  ): void {
    const nextMarkerKeys = new Set(
      markers.map((marker) => this.getMarkerKey(marker)),
    );

    Array.from(this.renderedMarkerLayers.keys()).forEach((key) => {
      if (this.renderedMarkerSnapshots.get(key)?.displayMode === 'heatmap') {
        return;
      }

      if (!nextMarkerKeys.has(key)) {
        this.removeMarkerLayer(map, key);
      }
    });

    markers.forEach((marker) => {
      const markerKey = this.getMarkerKey(marker);
      const existingSnapshot = this.renderedMarkerSnapshots.get(markerKey);

      if (existingSnapshot && isEqual(existingSnapshot, marker)) {
        return;
      }

      void this.upsertMarker(
        map,
        marker,
        markerKey,
        renderSequence,
        onMarkerClick,
      );
    });
  }

  private removeHeatLayer(map: leaflet.Map | undefined): void {
    this.heatmapRenderer.remove(map);

    Array.from(this.renderedMarkerLayers.keys()).forEach((key) => {
      if (this.renderedMarkerSnapshots.get(key)?.displayMode === 'heatmap') {
        this.removeMarkerLayer(map, key);
      }
    });
  }

  private removeMarkerLayer(
    map: leaflet.Map | undefined,
    markerKey: string,
  ): void {
    const layer = this.renderedMarkerLayers.get(markerKey);
    if (layer && map?.hasLayer(layer)) {
      layer.remove();
    }

    this.renderedMarkerLayers.delete(markerKey);
    this.renderedMarkerSnapshots.delete(markerKey);
  }

  private async upsertMarker(
    map: leaflet.Map | undefined,
    marker: Marker,
    markerKey: string,
    renderSequence: number,
    onMarkerClick: (location: LatLong) => void,
  ): Promise<void> {
    const divIcon =
      marker.displayMode === 'circle'
        ? this.mapIconLoader.getCircleMarkerDivIcon(marker)
        : await this.mapIconLoader.getMarkerDivIcon(marker);

    if (!map || renderSequence !== this.markerRenderSequence) {
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
      layer.on('click', (event: leaflet.LeafletMouseEvent) => {
        const { lat, lng } = event.latlng;
        onMarkerClick([lat, lng]);
      });
    }

    layer.addTo(map);
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

  private async renderMarker(
    map: leaflet.Map | undefined,
    marker: Marker,
    onMarkerClick: (location: LatLong) => void,
  ): Promise<void> {
    const markerKey = this.getMarkerKey(marker);
    await this.upsertMarker(
      map,
      marker,
      markerKey,
      this.markerRenderSequence,
      onMarkerClick,
    );
  }

  private async renderHeatLayer(
    map: leaflet.Map | undefined,
    markers: Marker[],
    renderSequence: number,
    onMarkerClick: (location: LatLong) => void,
  ): Promise<void> {
    if (!map || markers.length === 0) {
      return;
    }

    const renderedHeatLayer = await this.heatmapRenderer.render(map, markers);
    if (renderSequence !== this.markerRenderSequence) {
      return;
    }

    if (!renderedHeatLayer) {
      markers.forEach(
        (marker) => void this.renderMarker(map, marker, onMarkerClick),
      );
    }
  }
}
