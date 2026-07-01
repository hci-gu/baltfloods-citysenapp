import * as leaflet from 'leaflet';
import { Marker } from './map.models';

export class LeafletHeatmapRenderer {
  private heatLayer: leaflet.HeatLayer | null = null;
  private heatLayerLoadPromise: Promise<boolean> | null = null;

  public remove(map: leaflet.Map | undefined): void {
    if (this.heatLayer && map?.hasLayer(this.heatLayer)) {
      map.removeLayer(this.heatLayer);
    }
    this.heatLayer = null;
  }

  public async render(map: leaflet.Map, markers: Marker[]): Promise<boolean> {
    if (markers.length === 0) {
      return true;
    }

    const hasHeatLayerFactory = await this.ensureHeatLayerFactory();
    if (!hasHeatLayerFactory) {
      return false;
    }

    const heatPoints: [number, number, number][] = markers.map((marker) => [
      marker.location[0],
      marker.location[1],
      Math.max(0.05, Math.min(marker.heatIntensity ?? 0.2, 1)),
    ]);

    const heatLayerFactory = this.getHeatLayerFactory();
    if (!heatLayerFactory) {
      return false;
    }

    const heatGradient = Object.fromEntries([
      [0.2, '#0ea5e9'],
      [0.4, '#22c55e'],
      [0.6, '#facc15'],
      [0.8, '#f97316'],
      [1, '#dc2626'],
    ]);

    this.heatLayer = heatLayerFactory(heatPoints, {
      radius: 30,
      blur: 22,
      minOpacity: 0.35,
      maxZoom: 18,
      gradient: heatGradient,
    }).addTo(map);

    return true;
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
    return !!this.getHeatLayerFactory();
  }

  private getHeatLayerFactory():
    | ((
        latlngs: [number, number, number][],
        options?: leaflet.HeatMapOptions,
      ) => leaflet.HeatLayer)
    | null {
    const globalLeaflet = (globalThis as { L?: typeof leaflet }).L as
      | (typeof leaflet & {
          heatLayer?: (
            latlngs: [number, number, number][],
            options?: leaflet.HeatMapOptions,
          ) => leaflet.HeatLayer;
        })
      | undefined;
    const moduleLeaflet = leaflet as typeof leaflet & {
      heatLayer?: (
        latlngs: [number, number, number][],
        options?: leaflet.HeatMapOptions,
      ) => leaflet.HeatLayer;
    };

    return globalLeaflet?.heatLayer ?? moduleLeaflet.heatLayer ?? null;
  }
}
