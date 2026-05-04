import { Shallow } from 'shallow-render';
import { MapComponent, Marker } from './map.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { BehaviorSubject, Subject, of } from 'rxjs';
import * as leaflet from 'leaflet';
import { environment } from '@environments/environment';
import { LatLong } from '@core/models/location';
import {
  DATA_POINT_QUALITY_COLOR_CHART,
  DataPointQuality,
} from '@core/models/data-point';
import { SimpleChange } from '@angular/core';

describe('MapComponent', () => {
  let shallow: Shallow<MapComponent>;
  const leafletWithHeat = leaflet as unknown as {
    heatLayer?: unknown;
  };

  beforeEach(() => {
    delete leafletWithHeat.heatLayer;
    shallow = new Shallow(MapComponent)
      .mock(HttpClient, {
        get: () => of('<svg fill="currentColor" stroke="strokeColor"></svg>'),
      })
      .replaceModule(HttpClientModule, HttpClientTestingModule);
  });

  describe('zoom', () => {
    it('should set zoom when input is not defined', async () => {
      const { instance } = await shallow.render();
      const defaultLocation = environment.defaultLocation;

      expect(instance.map?.getCenter()).toEqual({
        lat: defaultLocation[0],
        lng: defaultLocation[1],
      });
      expect(instance.map?.getZoom()).toBe(13);
    });
  });

  describe('center', () => {
    it('should set initial center as the default environment value', async () => {
      const { instance } = await shallow.render();
      const defaultLocation = environment.defaultLocation;

      expect(instance.map?.getCenter()).toEqual({
        lat: defaultLocation[0],
        lng: defaultLocation[1],
      });
    });

    it('should apply an initial center emitted before the map is initialized', async () => {
      const center$ = new BehaviorSubject<LatLong>([0, 2]);
      const { instance } = await shallow.render({ bind: { center$ } });

      expect(instance.map?.getCenter()).toEqual({ lat: 0, lng: 2 });
    });

    it('should update the center when a new point is set in the map service', async () => {
      const center$ = new Subject<LatLong>();
      const { instance } = await shallow.render({ bind: { center$ } });

      center$.next([0, 2]);
      expect(instance.map?.getCenter()).toEqual({ lat: 0, lng: 2 });
    });
  });

  describe('should render markers', () => {
    it('when marker only has the location property', async () => {
      const markers: Marker[] = [{ location: [0, 0] }, { location: [1, 1] }];

      const { fixture, instance } = await shallow.render({ bind: { markers } });
      await fixture.whenStable();

      expect(instance.markers.length).toBe(markers.length);
    });

    it('should keep existing marker layers when unchanged markers re-emit', async () => {
      const markers: Marker[] = [{ location: [0, 0] }, { location: [1, 1] }];
      const { fixture, instance } = await shallow.render({ bind: { markers } });
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const initialLayersByLocation = getRenderedMarkerLayers(instance);
      expect(initialLayersByLocation.size).toBe(markers.length);

      const nextMarkers: Marker[] = markers.map((marker) => ({
        ...marker,
        location: [...marker.location] as LatLong,
      }));
      instance.markers = nextMarkers;
      instance.ngOnChanges({
        markers: new SimpleChange(markers, nextMarkers, false),
      });

      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const renderedLayersByLocation = getRenderedMarkerLayers(instance);
      expect(renderedLayersByLocation.size).toBe(markers.length);
      renderedLayersByLocation.forEach((layer, location) => {
        expect(layer).toBe(initialLayersByLocation.get(location));
      });
    });

    it('when the marker input is updated it should shown the correct updated markers', async () => {
      const markers: Marker[] = [
        {
          location: [0, 0],
          active: false,
          color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
        },
        { location: [1, 1], active: false },
      ];
      const { find, fixture, instance } = await shallow.render({
        bind: { markers },
      });

      await fixture.whenStable();

      expect(find('.leaflet-marker-icon').length).toBe(markers.length);

      const firstMarkerElement = find('.leaflet-marker-icon')[0]
        .nativeElement as HTMLElement;
      const firstMarkerHTML = firstMarkerElement.innerHTML;
      const firstMarkerClassList = firstMarkerElement.classList;
      expect(getFillHexCode(firstMarkerHTML)).toBe(
        DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
      );
      expect(firstMarkerClassList.contains('active')).not.toBe(true);

      const secondMarkerElement = find('.leaflet-marker-icon')[1]
        .nativeElement as HTMLElement;
      const secondMarkerHTML = secondMarkerElement.innerHTML;
      const secondMarkerClassList = secondMarkerElement.classList;

      expect(getFillHexCode(secondMarkerHTML)).toBe(
        DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT],
      );
      expect(secondMarkerClassList.contains('active')).not.toBe(true);

      const newMarkers: Marker[] = [
        {
          location: [0, 0],
          color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.POOR],
          active: true,
        },
      ];
      instance.markers = newMarkers;
      instance.ngOnChanges({
        markers: new SimpleChange(markers, newMarkers, false),
      });

      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(find('.leaflet-marker-icon').length).toBe(newMarkers.length);

      const markerElement = find('.leaflet-marker-icon')
        .nativeElement as HTMLElement;
      const markerHTML = markerElement.innerHTML;
      const markerClassList = markerElement.classList;

      expect(getFillHexCode(markerHTML)).toBe(
        DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.POOR],
      );

      expect(markerClassList.contains('active')).toBe(true);
    });

    it('should keep rendering regular markers when heatmap markers are present', async () => {
      const markers: Marker[] = [
        {
          location: [0, 0],
          displayMode: 'heatmap',
          heatIntensity: 0.5,
        },
        {
          location: [1, 1],
          icon: 'user-marker.svg',
          color: '#2563eb',
        },
      ];

      const { find, fixture, instance } = await shallow.render();
      const renderHeatLayerSpy = jest
        .spyOn(
          instance as unknown as { renderHeatLayer: () => Promise<void> },
          'renderHeatLayer',
        )
        .mockResolvedValue(undefined);

      instance.markers = markers;
      instance.ngOnChanges({
        markers: new SimpleChange([], markers, false),
      });
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      expect(renderHeatLayerSpy).toHaveBeenCalledWith(
        [markers[0]],
        expect.any(Number),
      );
      expect(find('.leaflet-marker-icon')).toHaveFound(1);
    });

    it('should render a count badge when a marker has multiple points', async () => {
      const markers: Marker[] = [{ location: [0, 0], count: 3 }];

      const { find, fixture } = await shallow.render({ bind: { markers } });
      await fixture.whenStable();

      expect(find('.marker-count-badge').nativeElement.textContent).toBe('3');
    });

    it('should render circle markers below pin markers', async () => {
      const markers: Marker[] = [
        { location: [0, 0], displayMode: 'circle', color: '#2563eb' },
        { location: [1, 1] },
      ];

      const { find, fixture, instance } = await shallow.render({
        bind: { markers },
      });
      await fixture.whenStable();

      const circleMarkers: leaflet.Marker[] = [];
      instance.map?.eachLayer((layer) => {
        if (
          layer instanceof leaflet.Marker &&
          layer.options.zIndexOffset === -1000
        ) {
          circleMarkers.push(layer);
        }
      });

      expect(circleMarkers).toHaveLength(1);
      expect(circleMarkers[0].options.interactive).toBe(false);
      expect(circleMarkers[0].options.zIndexOffset).toBe(-1000);
      expect(find('.location-dot-marker')).toHaveFound(1);
      expect(find('.leaflet-marker-icon')).toHaveFound(2);
    });
  });

  it('should emit markerClick event when a marker is clicked', async () => {
    const location = [0, 0] as [number, number];
    const markers: Marker[] = [{ location }];
    const { instance, fixture } = await shallow.render({ bind: { markers } });

    await fixture.whenStable();

    instance.map?.eachLayer((layer) => {
      if (layer instanceof leaflet.Marker) {
        layer.fire('click', {
          latlng: leaflet.latLng(location),
        });
      }
    });

    expect(instance.markerClick.emit).toHaveBeenCalledWith(location);
  });
});

function getFillHexCode(svgString: string): string | null {
  const fillMatch = RegExp(/fill="#([A-Fa-f0-9]{6})"/).exec(svgString);
  return fillMatch ? `#${fillMatch[1]}` : null;
}

function getRenderedMarkerLayers(
  instance: MapComponent,
): Map<string, leaflet.Marker> {
  const layers = new Map<string, leaflet.Marker>();
  instance.map?.eachLayer((layer) => {
    if (layer instanceof leaflet.Marker) {
      layers.set(layer.getLatLng().toString(), layer);
    }
  });

  return layers;
}
