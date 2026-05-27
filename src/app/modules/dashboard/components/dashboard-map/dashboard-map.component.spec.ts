import {
  BrowserAnimationsModule,
  NoopAnimationsModule,
} from '@angular/platform-browser/animations';
import { SENSOR_THRESHOLD_COLORS } from '@core/config/sensor-thresholds';
import {
  DATA_POINT_QUALITY_COLOR_CHART,
  DATA_POINT_TYPE_ICON,
  DataPointQuality,
  DataPointType,
  ParkingDataPoint,
  RoadWorksDataPoint,
  WaterbagTestKitDataPoint,
  WeatherAirQualityDataPoint,
  WeatherConditionDataPoint,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { LatLong } from '@core/models/location';
import { DataPointsApi } from '@core/services/datapoints-api/datapoints-api.service';
import { LocationService, UserLocation } from '@core/services/location.service';
import { ObservationDraftService } from '@core/services/observation-draft.service';
import { ObservationRealtimeService } from '@core/services/observation-realtime.service';
import {
  ScheduledMessage,
  ScheduledMessagesService,
} from '@core/services/scheduled-messages.service';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '@environments/environment';
import { MapComponent } from '@shared/components/map/map.component';
import { MessageService, SharedModule } from 'primeng/api';
import { EMPTY, firstValueFrom, of } from 'rxjs';
import { Shallow } from 'shallow-render';
import { DashboardDataPointDetailComponent } from '../dashboard-data-point-detail/dashboard-data-point-detail.component';
import { DashboardMessageBannerComponent } from '../dashboard-message-banner/dashboard-message-banner.component';
import { DashboardMapComponent } from './dashboard-map.component';
import { AsyncPipe } from '@angular/common';
import { SensorHistoryPoint } from '@core/services/datapoints-api/datapoints-api.service';

describe('DashboardMapComponent', () => {
  let shallow: Shallow<DashboardMapComponent>;

  beforeEach(() => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-04-14T12:00:00Z').getTime());
    shallow = new Shallow(DashboardMapComponent)

      .dontMock(DashboardMessageBannerComponent)

      .mock(TranslateService, { instant: jest.fn })
      .mock(Router, { navigate: jest.fn().mockResolvedValue(true) })
      .mock(ObservationDraftService, { setQuickObservationDraft: jest.fn() })
      .mock(MessageService, { add: jest.fn(), clear: jest.fn() })
      .mock(DataPointsApi, {
        getWeatherConditions: jest
          .fn()
          .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
        getWeatherStormWater: jest
          .fn()
          .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
        getWeatherAirQuality: jest
          .fn()
          .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
        getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
        getStormWaterHistory: jest
          .fn()
          .mockReturnValue(of([] as SensorHistoryPoint[])),
        getWaterbagTestKits: jest
          .fn()
          .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
        getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
      })
      .mock(LocationService, {
        refreshUserLocation: jest.fn(),
        locationPermissionState$: of('granted' as PermissionState),
        userLocation$: of({
          loading: false,
          location: [1, 1],
        } as UserLocation),
      })
      .mock(ScheduledMessagesService, {
        getActiveMessages: jest
          .fn()
          .mockReturnValue(of([] as ScheduledMessage[])),
        watchActiveMessages: jest
          .fn()
          .mockReturnValue(of([] as ScheduledMessage[])),
      })
      .mock(ObservationRealtimeService, {
        observationChanges$: EMPTY,
      })
      .provideMock(AsyncPipe)
      .import(BrowserAnimationsModule)
      .replaceModule(BrowserAnimationsModule, NoopAnimationsModule)
      .provideMock(SharedModule);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('data fetching', () => {
    it('should show a loader when fetching data and clear when all data has been loaded', async () => {
      const { inject } = await shallow.render();

      const messageService = inject(MessageService);
      expect(messageService.add).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ key: 'loading' }),
      );

      expect(messageService.clear).toHaveBeenNthCalledWith(1, 'loading');
    });

    it('should not refetch observation data for small map movements', async () => {
      const { inject, instance } = await shallow.render();
      const dataPointsApi = inject(DataPointsApi);
      const [latitude, longitude] = environment.defaultLocation as LatLong;

      expect(dataPointsApi.getWeatherStormWater).toHaveBeenCalledTimes(1);
      expect(dataPointsApi.getWaterbagTestKits).toHaveBeenCalledTimes(1);

      instance.onMapCenterChange([latitude + 0.0001, longitude + 0.0001]);

      expect(dataPointsApi.getWeatherStormWater).toHaveBeenCalledTimes(1);
      expect(dataPointsApi.getWaterbagTestKits).toHaveBeenCalledTimes(1);
    });

    it('should only refetch storm-water data after meaningful map movement', async () => {
      const { inject, instance } = await shallow.render();
      const dataPointsApi = inject(DataPointsApi);
      const [latitude, longitude] = environment.defaultLocation as LatLong;

      instance.onMapCenterChange([latitude + 1, longitude + 1]);

      expect(dataPointsApi.getWeatherStormWater).toHaveBeenCalledTimes(2);
      expect(dataPointsApi.getWaterbagTestKits).toHaveBeenCalledTimes(1);
    });
  });

  describe('markers', () => {
    it('should show marker detail on click and close on close', async () => {
      const { fixture, findComponent } = await shallow.render();

      expect(findComponent(DashboardDataPointDetailComponent)).toHaveFound(0);

      findComponent(MapComponent).markerClick.emit([100, 100]);

      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        findComponent(MapComponent).markers.filter(({ active }) => !!active),
      ).toEqual([
        expect.objectContaining({
          location: [100, 100],
          active: true,
          count: 2,
        }),
      ]);

      expect(
        findComponent(DashboardDataPointDetailComponent).dataPoints,
      ).toEqual([
        WEATHER_CONDITION_DATA_POINTS[2],
        WEATHER_STORM_WATER_DATA_POINTS[2],
      ]);
      findComponent(DashboardDataPointDetailComponent).close.emit();

      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        findComponent(MapComponent).markers.some(({ active }) => !!active),
      ).toBe(false);
      expect(findComponent(DashboardDataPointDetailComponent)).toHaveFound(0);
    });

    it('should close the mobile bottom panel when opening marker detail', async () => {
      const { fixture, findComponent, instance } = await shallow.render();

      instance.setMobileBottomPanel('list');
      expect(instance.activeMobileBottomPanel()).toBe('list');

      findComponent(MapComponent).markerClick.emit([100, 100]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(instance.activeMobileBottomPanel()).toBeNull();
      expect(
        findComponent(MapComponent).markers.filter(({ active }) => !!active),
      ).toEqual([
        expect.objectContaining({
          location: [100, 100],
          active: true,
        }),
      ]);
      expect(findComponent(DashboardDataPointDetailComponent)).toHaveFound(1);
    });

    it('should include the current user location marker on the map', async () => {
      const currentLocation = [55.123, 12.456] as LatLong;
      const { findComponent } = await shallow
        .mock(LocationService, {
          refreshUserLocation: jest.fn(),
          locationPermissionState$: of('granted' as PermissionState),
          userLocation$: of({
            loading: false,
            location: currentLocation,
          } as UserLocation),
        })
        .render();

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            location: currentLocation,
            displayMode: 'circle',
            color: '#2563eb',
          }),
        ]),
      );
    });
  });

  describe('data points', () => {
    it('should create markers for every point', async () => {
      const { findComponent, fixture } = await shallow.render();

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([
          {
            location: [1, 1],
            icon: DATA_POINT_TYPE_ICON[DataPointType.WEATHER_CONDITIONS],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
          },
          {
            location: [2, 2],
            icon: DATA_POINT_TYPE_ICON[DataPointType.WEATHER_CONDITIONS],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.FAIR],
          },
          {
            location: [3, 3],
            icon: DATA_POINT_TYPE_ICON[DataPointType.STORM_WATER],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
          },
          {
            location: [4, 4],
            icon: 'sensor-water-level-icon.svg',
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.FAIR],
          },
          {
            location: [5, 5],
            icon: DATA_POINT_TYPE_ICON[DataPointType.AIR_QUALITY],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
          },
          {
            location: [6, 6],
            icon: DATA_POINT_TYPE_ICON[DataPointType.AIR_QUALITY],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.VERY_POOR],
          },
          {
            location: [7, 7],
            icon: DATA_POINT_TYPE_ICON[DataPointType.PARKING],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT],
          },
          {
            location: [8, 8],
            icon: DATA_POINT_TYPE_ICON[DataPointType.PARKING],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT],
          },
          {
            location: [100, 100],
            icon: 'multiple-data-points.svg',
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT],
            count: 2,
          },
        ]),
      );
    });

    it('should merge overlapping nearby observations until zoomed in enough', async () => {
      const nearbyPoints: WeatherConditionDataPoint[] = [
        {
          location: [57.7089, 11.9746],
          type: DataPointType.WEATHER_CONDITIONS,
          quality: DataPointQuality.GOOD,
          name: 'Observation 1',
          data: {},
        },
        {
          location: [57.7089, 11.9747],
          type: DataPointType.WEATHER_CONDITIONS,
          quality: DataPointQuality.FAIR,
          name: 'Observation 2',
          data: {},
        },
      ];
      const { findComponent, fixture, instance } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest.fn().mockReturnValue(of(nearbyPoints)),
          getWeatherStormWater: jest.fn().mockReturnValue(of([])),
          getWeatherAirQuality: jest.fn().mockReturnValue(of([])),
          getParking: jest.fn().mockReturnValue(of([])),
          getStormWaterHistory: jest
            .fn()
            .mockReturnValue(of([] as SensorHistoryPoint[])),
          getWaterbagTestKits: jest.fn().mockReturnValue(of([])),
          getRoadWorks: jest.fn().mockReturnValue(of([])),
        })
        .render();

      instance.onMapBoundsChange({
        south: 57,
        west: 11,
        north: 58,
        east: 12,
        zoom: 13,
      });
      fixture.detectChanges();

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            icon: 'multiple-data-points.svg',
            count: 2,
          }),
        ]),
      );

      instance.onMapBoundsChange({
        south: 57,
        west: 11,
        north: 58,
        east: 12,
        zoom: 20,
      });
      fixture.detectChanges();

      expect(
        findComponent(MapComponent).markers.filter(
          (marker) =>
            marker.icon ===
            DATA_POINT_TYPE_ICON[DataPointType.WEATHER_CONDITIONS],
        ),
      ).toHaveLength(2);
      expect(
        findComponent(MapComponent).markers.some(
          (marker) => marker.count === 2,
        ),
      ).toBe(false);
    });

    it('should color Intoto sensor markers by their active threshold level', async () => {
      const sensorPoints: WeatherStormWaterDataPoint[] = [
        {
          location: [57.7, 11.974],
          type: DataPointType.STORM_WATER,
          quality: DataPointQuality.GOOD,
          name: 'Below threshold',
          data: { waterLevel: 17.9 },
          historySeries: {
            provider: 'intoto',
            seriesId: 121,
          },
        },
        {
          location: [57.72, 11.974],
          type: DataPointType.STORM_WATER,
          quality: DataPointQuality.GOOD,
          name: 'Yellow threshold',
          data: { waterLevel: 18 },
          historySeries: {
            provider: 'intoto',
            seriesId: 121,
          },
        },
        {
          location: [57.74, 11.974],
          type: DataPointType.STORM_WATER,
          quality: DataPointQuality.GOOD,
          name: 'Orange threshold',
          data: { waterLevel: 18.5 },
          historySeries: {
            provider: 'intoto',
            seriesId: 121,
          },
        },
        {
          location: [57.76, 11.974],
          type: DataPointType.STORM_WATER,
          quality: DataPointQuality.GOOD,
          name: 'Red threshold',
          data: { waterLevel: 19.5 },
          historySeries: {
            provider: 'intoto',
            seriesId: 121,
          },
        },
      ];
      const { findComponent } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest.fn().mockReturnValue(of([])),
          getWeatherStormWater: jest.fn().mockReturnValue(of(sensorPoints)),
          getWeatherAirQuality: jest.fn().mockReturnValue(of([])),
          getParking: jest.fn().mockReturnValue(of([])),
          getStormWaterHistory: jest
            .fn()
            .mockReturnValue(of([] as SensorHistoryPoint[])),
          getWaterbagTestKits: jest.fn().mockReturnValue(of([])),
          getRoadWorks: jest.fn().mockReturnValue(of([])),
        })
        .render();

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            location: [57.7, 11.974],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
          }),
          expect.objectContaining({
            location: [57.72, 11.974],
            color: SENSOR_THRESHOLD_COLORS.yellow,
          }),
          expect.objectContaining({
            location: [57.74, 11.974],
            color: SENSOR_THRESHOLD_COLORS.orange,
          }),
          expect.objectContaining({
            location: [57.76, 11.974],
            color: SENSOR_THRESHOLD_COLORS.red,
          }),
        ]),
      );
    });

    it('should color an Intoto sensor marker red when its recent history triggers an alarm', async () => {
      const sensorPoint: WeatherStormWaterDataPoint = {
        location: [57.7, 11.974],
        type: DataPointType.STORM_WATER,
        quality: DataPointQuality.GOOD,
        name: 'Recent red threshold',
        data: { waterLevel: 17.8 },
        historySeries: {
          provider: 'intoto',
          seriesId: 121,
        },
      };
      const { findComponent, fixture } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest.fn().mockReturnValue(of([])),
          getWeatherStormWater: jest.fn().mockReturnValue(of([sensorPoint])),
          getWeatherAirQuality: jest.fn().mockReturnValue(of([])),
          getParking: jest.fn().mockReturnValue(of([])),
          getStormWaterHistory: jest.fn().mockReturnValue(
            of([
              {
                timestamp: new Date('2026-04-14T00:00:00Z'),
                value: 17.8,
              },
              {
                timestamp: new Date('2026-04-14T08:00:00Z'),
                value: 19.5,
              },
              {
                timestamp: new Date('2026-04-14T12:00:00Z'),
                value: 17.8,
              },
            ] as SensorHistoryPoint[]),
          ),
          getWaterbagTestKits: jest.fn().mockReturnValue(of([])),
          getRoadWorks: jest.fn().mockReturnValue(of([])),
        })
        .render();

      await fixture.whenStable();
      fixture.detectChanges();

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            location: [57.7, 11.974],
            color: SENSOR_THRESHOLD_COLORS.red,
          }),
        ]),
      );
    });

    it('should open an alarmed Intoto sensor on the history point that triggered the alert', async () => {
      const alarmTimestamp = new Date('2026-04-14T08:00:00Z');
      const sensorPoint: WeatherStormWaterDataPoint = {
        location: [57.7, 11.974],
        type: DataPointType.STORM_WATER,
        quality: DataPointQuality.GOOD,
        name: 'Recent red threshold',
        data: { waterLevel: 17.8 },
        historySeries: {
          provider: 'intoto',
          seriesId: 121,
        },
      };
      const { findComponent, fixture } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest.fn().mockReturnValue(of([])),
          getWeatherStormWater: jest.fn().mockReturnValue(of([sensorPoint])),
          getWeatherAirQuality: jest.fn().mockReturnValue(of([])),
          getParking: jest.fn().mockReturnValue(of([])),
          getStormWaterHistory: jest.fn().mockReturnValue(
            of([
              {
                timestamp: new Date('2026-04-14T00:00:00Z'),
                value: 17.8,
              },
              {
                timestamp: alarmTimestamp,
                value: 19.5,
              },
              {
                timestamp: new Date('2026-04-14T12:00:00Z'),
                value: 17.8,
              },
            ] as SensorHistoryPoint[]),
          ),
          getWaterbagTestKits: jest.fn().mockReturnValue(of([])),
          getRoadWorks: jest.fn().mockReturnValue(of([])),
        })
        .render();

      await fixture.whenStable();
      fixture.detectChanges();

      findComponent(MapComponent).markerClick.emit([57.7, 11.974]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        findComponent(DashboardDataPointDetailComponent).dataPoints,
      ).toEqual([
        expect.objectContaining({
          type: DataPointType.STORM_WATER,
          lastUpdatedOn: alarmTimestamp,
          data: expect.objectContaining({ waterLevel: 19.5 }),
        }),
      ]);
    });

  });

  describe('focus location', () => {
    it('should set center on map on initial render when user location is already available', async () => {
      const currentLocation = [4, 4] as LatLong;

      const { instance } = await shallow
        .mock(LocationService, {
          refreshUserLocation: jest.fn(),
          locationPermissionState$: of('granted' as PermissionState),
          userLocation$: of({
            loading: false,
            location: currentLocation,
          } as UserLocation),
        })
        .render();

      expect(await firstValueFrom(instance.mapCenter$)).toEqual(
        currentLocation,
      );
    });

    it('should set center on map when user location is available', async () => {
      const currentLocation = [4, 4] as LatLong;

      const { find, instance } = await shallow
        .mock(LocationService, {
          refreshUserLocation: jest.fn(),
          locationPermissionState$: of('granted' as PermissionState),
          userLocation$: of({
            loading: false,
            location: currentLocation,
          } as UserLocation),
        })
        .render();

      find('.focus-location-button').triggerEventHandler('click');

      expect(await firstValueFrom(instance.mapCenter$)).toEqual(
        currentLocation,
      );
    });

    it('should show alert when permission state is "denied"', async () => {
      const { find, fixture } = await shallow
        .mock(LocationService, {
          refreshUserLocation: jest.fn(),
          locationPermissionState$: of('denied' as PermissionState),
          userLocation$: of({
            loading: false,
            location: undefined,
          }),
        })
        .render();

      jest.spyOn(window, 'alert').mockImplementation(jest.fn);

      find('.focus-location-button').triggerEventHandler('click');
      await fixture.whenStable();

      expect(window.alert).toHaveBeenCalled();
    });
  });

  describe('display mode', () => {
    it('should keep the user location marker when switching to heatmap', async () => {
      const currentLocation = [55.123, 12.456] as LatLong;
      const { findComponent, instance } = await shallow
        .mock(LocationService, {
          refreshUserLocation: jest.fn(),
          locationPermissionState$: of('granted' as PermissionState),
          userLocation$: of({
            loading: false,
            location: currentLocation,
          } as UserLocation),
        })
        .render();

      instance.setDisplayMode('heatmap');

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            location: currentLocation,
            displayMode: 'circle',
            color: '#2563eb',
          }),
        ]),
      );
    });
  });

  describe('observations feed', () => {
    it('should render observations and focus the selected one on map', async () => {
      const { find, fixture, instance } = await shallow.render();

      instance.setMobileBottomPanel('list');
      expect(find('.observation-item')).toHaveFound(
        WEATHER_CONDITION_DATA_POINTS.length +
          WEATHER_STORM_WATER_DATA_POINTS.length +
          WEATHER_AIR_QUALITY_DATA_POINTS.length +
          PARKING_DATA_POINTS.length +
          ROAD_WORKS_DATA_POINTS.length,
      );

      find('.observation-item')[0].nativeElement.click();
      fixture.detectChanges();

      expect(await firstValueFrom(instance.mapCenter$)).toEqual([1, 1]);
      expect(instance.activeMobileBottomPanel()).toBeNull();
    });

    it('should label Intoto storm-water observations as sensor readings', async () => {
      const { fixture, instance } = await shallow.render();

      fixture.detectChanges();

      const sensorObservation = instance
        .observationFeed()
        .find(
          (item) =>
            item.type === DataPointType.STORM_WATER &&
            item.location[0] === 4 &&
            item.location[1] === 4,
        );

      expect(sensorObservation?.typeLabel).toBe('Sensor reading');
    });

    it('should sort map observations by data timestamp and then created timestamp', async () => {
      const sameDataTimestamp = new Date('2026-04-12T10:00:00Z');
      const waterbagPoints: WaterbagTestKitDataPoint[] = [
        {
          name: 'Same data time older upload',
          type: DataPointType.WATERBAG_TESTKIT,
          quality: DataPointQuality.DEFAULT,
          lastUpdatedOn: sameDataTimestamp,
          createdOn: new Date('2026-04-12T10:00:01Z'),
          location: [57.1, 11.1],
          data: {},
        },
        {
          name: 'Same data time newer upload',
          type: DataPointType.WATERBAG_TESTKIT,
          quality: DataPointQuality.DEFAULT,
          lastUpdatedOn: sameDataTimestamp,
          createdOn: new Date('2026-04-12T10:00:02Z'),
          location: [57.2, 11.2],
          data: {},
        },
        {
          name: 'Newer data time',
          type: DataPointType.WATERBAG_TESTKIT,
          quality: DataPointQuality.DEFAULT,
          lastUpdatedOn: new Date('2026-04-13T10:00:00Z'),
          createdOn: new Date('2026-04-13T10:00:00Z'),
          location: [57.3, 11.3],
          data: {},
        },
      ];

      const { fixture, instance } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest.fn().mockReturnValue(of([])),
          getWeatherStormWater: jest.fn().mockReturnValue(of([])),
          getWeatherAirQuality: jest.fn().mockReturnValue(of([])),
          getParking: jest.fn().mockReturnValue(of([])),
          getStormWaterHistory: jest
            .fn()
            .mockReturnValue(of([] as SensorHistoryPoint[])),
          getWaterbagTestKits: jest.fn().mockReturnValue(of(waterbagPoints)),
          getRoadWorks: jest.fn().mockReturnValue(of([])),
        })
        .render();

      await fixture.whenStable();
      fixture.detectChanges();

      expect(instance.observationFeed().map((item) => item.name)).toEqual([
        'Newer data time',
        'Same data time newer upload',
        'Same data time older upload',
      ]);
    });

    it('should default to 1 year with a 30 day active window', async () => {
      const { find, fixture } = await shallow.render();

      expect(
        find('.timespan-filter-button').nativeElement.textContent,
      ).toContain('1 year');
      expect(find('.observation-item')).toHaveFound(
        WEATHER_CONDITION_DATA_POINTS.length +
          WEATHER_STORM_WATER_DATA_POINTS.length +
          WEATHER_AIR_QUALITY_DATA_POINTS.length +
          PARKING_DATA_POINTS.length +
          ROAD_WORKS_DATA_POINTS.length,
      );

      find('.timespan-filter-button').triggerEventHandler('click');
      fixture.detectChanges();
      find('.timespan-filter-option')
        .map((item) => item.nativeElement as HTMLButtonElement)
        .find((button) => button.textContent?.includes('5 years'))
        ?.click();
      fixture.detectChanges();

      expect(find('.observation-item')).toHaveFound(
        WEATHER_CONDITION_DATA_POINTS.length +
          WEATHER_STORM_WATER_DATA_POINTS.length +
          WEATHER_AIR_QUALITY_DATA_POINTS.length +
          PARKING_DATA_POINTS.length +
          ROAD_WORKS_DATA_POINTS.length,
      );
    });

    it('should keep map scoped to the active 30 day window after timespan changes', async () => {
      const { find, findComponent, fixture } = await shallow.render();

      expect(findComponent(MapComponent).markers).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ location: [61.05871, 28.18871] }),
        ]),
      );

      find('.timespan-filter-button').triggerEventHandler('click');
      fixture.detectChanges();
      find('.timespan-filter-option')
        .map((item) => item.nativeElement as HTMLButtonElement)
        .find((button) => button.textContent?.includes('5 years'))
        ?.click();
      fixture.detectChanges();

      expect(findComponent(MapComponent).markers).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ location: [61.05871, 28.18871] }),
        ]),
      );
    });

    it('should keep an Intoto sensor visible when current time falls within its full history span', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-04-10T00:00:00Z'), value: 16.7 },
        { timestamp: new Date('2026-04-18T00:00:00Z'), value: 16.9 },
      ];
      const staleLatestPoint: WeatherStormWaterDataPoint[] = [
        {
          ...WEATHER_STORM_WATER_DATA_POINTS[0],
        },
        {
          ...WEATHER_STORM_WATER_DATA_POINTS[1],
          lastUpdatedOn: new Date('2026-01-01T00:00:00Z'),
        },
        {
          ...WEATHER_STORM_WATER_DATA_POINTS[2],
        },
      ];

      const { findComponent, fixture } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest.fn().mockReturnValue(of(staleLatestPoint)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      await fixture.whenStable();
      fixture.detectChanges();

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([expect.objectContaining({ location: [4, 4] })]),
      );
    });

    it('should show sensor values over time for an Intoto storm-water point', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-03-10T00:00:00Z'), value: 16.7 },
        { timestamp: new Date('2026-03-11T00:00:00Z'), value: 16.9 },
        { timestamp: new Date('2026-03-12T00:00:00Z'), value: 17.1 },
      ];

      const { find, findComponent, fixture, inject, instance } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      findComponent(MapComponent).markerClick.emit([4, 4]);
      await fixture.whenStable();
      fixture.detectChanges();

      const dataPointsApi = inject(DataPointsApi);
      expect(dataPointsApi.getStormWaterHistory).toHaveBeenCalledTimes(1);
      const [selectedPoint, fromDateTime, toDateTime] = (
        dataPointsApi.getStormWaterHistory as jest.Mock
      ).mock.calls[0];

      expect(selectedPoint).toEqual(
        expect.objectContaining({
          name: 'Lappeenranta Weather Hub',
          historySeries: expect.objectContaining({
            provider: 'intoto',
            seriesId: 121,
          }),
        }),
      );
      expect(fromDateTime).toBeInstanceOf(Date);
      expect(toDateTime).toBeInstanceOf(Date);
      expect(toDateTime.getTime() - fromDateTime.getTime()).toBeGreaterThan(
        300 * 24 * 60 * 60 * 1000,
      );
      expect(instance.selectedSensorViewEndInput()).toBe('2026-03-12');
      expect(instance.selectedSensorViewStartInput()).toBe('2026-03-10');

      expect(
        find('.timeline-header-main h3').nativeElement.textContent,
      ).toContain('Sensor values over time');
      expect(
        find('.timeline-chart[aria-label="Sensor values over time chart"]'),
      ).toHaveFound(1);
    });

    it('should update the opened sensor detail when the sensor cursor is dragged', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-01-10T00:00:00Z'), value: 12.3456 },
        { timestamp: new Date('2026-02-10T00:00:00Z'), value: 14.2 },
        { timestamp: new Date('2026-03-30T12:00:00Z'), value: 17.1 },
      ];

      const { findComponent, fixture, instance } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      findComponent(MapComponent).markerClick.emit([4, 4]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        findComponent(DashboardDataPointDetailComponent).dataPoints,
      ).toEqual([
        expect.objectContaining({
          type: DataPointType.STORM_WATER,
          lastUpdatedOn: sensorHistory[2].timestamp,
          data: expect.objectContaining({ waterLevel: 17.1 }),
        }),
      ]);

      const pointerTarget = {
        setPointerCapture: jest.fn(),
        hasPointerCapture: jest.fn().mockReturnValue(true),
        releasePointerCapture: jest.fn(),
      };
      const chartContainer = {
        getBoundingClientRect: () => ({
          left: 0,
          width: 100,
        }),
      };

      instance.onSensorCursorPointerDown(
        {
          clientX: 0,
          currentTarget: pointerTarget,
          pointerId: 1,
          preventDefault: jest.fn(),
        } as unknown as PointerEvent,
        chartContainer as unknown as HTMLElement,
      );
      fixture.detectChanges();

      expect(
        findComponent(DashboardDataPointDetailComponent).dataPoints,
      ).toEqual([
        expect.objectContaining({
          type: DataPointType.STORM_WATER,
          lastUpdatedOn: sensorHistory[0].timestamp,
          data: expect.objectContaining({ waterLevel: 12.346 }),
        }),
      ]);
    });

    it('should refetch sensor history for the selected sensor view date range', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-03-10T00:00:00Z'), value: 16.7 },
        { timestamp: new Date('2026-03-11T00:00:00Z'), value: 16.9 },
        { timestamp: new Date('2026-03-12T00:00:00Z'), value: 17.1 },
      ];

      const { findComponent, fixture, inject, instance } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      findComponent(MapComponent).markerClick.emit([4, 4]);
      await fixture.whenStable();
      fixture.detectChanges();

      const dataPointsApi = inject(DataPointsApi);
      expect(dataPointsApi.getStormWaterHistory).toHaveBeenCalledTimes(1);

      instance.onSensorViewStartDateChange('2026-03-11');
      instance.onSensorViewEndDateChange('2026-03-12');
      await fixture.whenStable();
      fixture.detectChanges();

      expect(dataPointsApi.getStormWaterHistory).toHaveBeenCalledTimes(1);
      expect(instance.selectedSensorViewStartInput()).toBe('2026-03-11');
      expect(instance.selectedSensorViewEndInput()).toBe('2026-03-12');
    });

    it('should bucket sensor history to the max point per day for views longer than one month', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-02-10T01:00:00Z'), value: 16.7 },
        { timestamp: new Date('2026-02-10T22:00:00Z'), value: 16.4 },
        { timestamp: new Date('2026-03-25T08:00:00Z'), value: 17.5 },
        { timestamp: new Date('2026-03-25T18:00:00Z'), value: 17.2 },
      ];

      const { findComponent, fixture, instance } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      findComponent(MapComponent).markerClick.emit([4, 4]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(instance.selectedSensorTimeline()?.points).toHaveLength(2);
      expect(instance.selectedSensorTimeline()?.points).toEqual([
        expect.objectContaining({
          timestamp: sensorHistory[0].timestamp,
          value: 16.7,
        }),
        expect.objectContaining({
          timestamp: sensorHistory[2].timestamp,
          value: 17.5,
        }),
      ]);
    });

    it('should use configured cutoff lines and severity colors for the Boen bru series', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-03-10T00:00:00Z'), value: 17.8 },
        { timestamp: new Date('2026-03-11T00:00:00Z'), value: 18.2 },
        { timestamp: new Date('2026-03-12T00:00:00Z'), value: 18.6 },
        { timestamp: new Date('2026-03-13T00:00:00Z'), value: 19.6 },
      ];

      const { findComponent, fixture, instance } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      findComponent(MapComponent).markerClick.emit([4, 4]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(instance.selectedSensorTimeline()?.thresholdLines).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'yellow-18-0',
            label: 'Yellow threshold',
            value: 18,
          }),
          expect.objectContaining({
            id: 'orange-18-5',
            label: 'Orange threshold',
            value: 18.5,
          }),
          expect.objectContaining({
            id: 'yellow-18-4',
            label: 'Yellow threshold',
            value: 18.4,
          }),
          expect.objectContaining({
            id: 'orange-19-5',
            label: 'Orange threshold',
            value: 19.5,
          }),
        ]),
      );
      expect(
        instance
          .selectedSensorTimeline()
          ?.points.map((point) => point.severity),
      ).toEqual(['green', 'yellow', 'orange', 'red']);
    });

    it('should prefetch sensor history for visible Intoto sensors only once per series and period', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-03-10T00:00:00Z'), value: 16.7 },
      ];

      const { fixture, inject, instance } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      const dataPointsApi = inject(DataPointsApi);
      expect(dataPointsApi.getStormWaterHistory).toHaveBeenCalledTimes(1);

      instance.onMapCenterChange([2, 2]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(dataPointsApi.getStormWaterHistory).toHaveBeenCalledTimes(1);
    });

    it('should toggle mobile bottom panel when open button is clicked', async () => {
      const { find, instance } = await shallow.render();

      expect(instance.activeMobileBottomPanel()).toBeNull();

      find('.open-bottom-panel-button').triggerEventHandler('click');

      expect(instance.activeMobileBottomPanel()).toBe('list');
    });

    it('should close mobile bottom panel when close button is clicked', async () => {
      const { find, instance } = await shallow.render();

      instance.setMobileBottomPanel('list');
      expect(instance.activeMobileBottomPanel()).toBe('list');

      find('.mobile-panel-close-tab')[0].triggerEventHandler('click');

      expect(instance.activeMobileBottomPanel()).toBeNull();
    });

    it('should switch between list and timeline panels', async () => {
      const { find, instance } = await shallow.render();

      instance.setMobileBottomPanel('list');
      expect(instance.activeMobileBottomPanel()).toBe('list');

      const tabs = find('.mobile-panel-tab');
      const timelineTab = tabs.find((tab) =>
        tab.nativeElement.textContent?.includes('Timeline'),
      );
      if (!timelineTab) throw new Error('Timeline tab not found');
      timelineTab.triggerEventHandler('click');

      expect(instance.activeMobileBottomPanel()).toBe('timeline');
    });

    it('should create a quick observation draft from the mobile camera shortcut', async () => {
      const { find, inject } = await shallow.render();
      const photo = new File(['photo'], 'overflow.jpg', {
        type: 'image/jpeg',
      });
      const input = {
        files: [photo],
        value: 'overflow.jpg',
      } as unknown as HTMLInputElement;

      find('.quick-observation-input').triggerEventHandler('click', {});
      find('.quick-observation-input').triggerEventHandler('change', {
        target: input,
      });

      expect(inject(LocationService).refreshUserLocation).toHaveBeenCalled();
      expect(
        inject(ObservationDraftService).setQuickObservationDraft,
      ).toHaveBeenCalledWith({
        location: [1, 1],
        observationType: 'water_overflow',
        photo,
      });
      expect(inject(Router).navigate).toHaveBeenCalledWith(['/observation'], {
        queryParams: { quick: '1' },
        queryParamsHandling: 'merge',
      });
      expect(input.value).toBe('');
    });
  });

  describe('filter', () => {
    it('opening and selecting a filter should filter the markers', async () => {
      const { find, findComponent, fixture } = await shallow.render();

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([
          {
            location: [1, 1],
            icon: DATA_POINT_TYPE_ICON[DataPointType.WEATHER_CONDITIONS],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
          },
          {
            location: [2, 2],
            icon: DATA_POINT_TYPE_ICON[DataPointType.WEATHER_CONDITIONS],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.FAIR],
          },
          {
            location: [3, 3],
            icon: DATA_POINT_TYPE_ICON[DataPointType.STORM_WATER],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
          },
          {
            location: [4, 4],
            icon: 'sensor-water-level-icon.svg',
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.FAIR],
          },
          {
            location: [5, 5],
            icon: DATA_POINT_TYPE_ICON[DataPointType.AIR_QUALITY],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.GOOD],
          },
          {
            location: [6, 6],
            icon: DATA_POINT_TYPE_ICON[DataPointType.AIR_QUALITY],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.VERY_POOR],
          },
          {
            location: [7, 7],
            icon: DATA_POINT_TYPE_ICON[DataPointType.PARKING],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT],
          },
          {
            location: [8, 8],
            icon: DATA_POINT_TYPE_ICON[DataPointType.PARKING],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT],
          },
        ]),
      );

      find('.map-control-dropdown-button')[0].triggerEventHandler('click');
      fixture.detectChanges();

      find(
        `[data-type="${DataPointType.WEATHER_CONDITIONS}"]`,
      ).triggerEventHandler('click');
      find(`[data-type="${DataPointType.PARKING}"]`).triggerEventHandler(
        'click',
      );
      find(
        `[data-type="${DataPointType.WEATHER_CONDITIONS}"]`,
      ).triggerEventHandler('click'); // toggled off
      fixture.detectChanges();

      expect(findComponent(MapComponent).markers).toEqual(
        expect.arrayContaining([
          {
            location: [7, 7],
            icon: DATA_POINT_TYPE_ICON[DataPointType.PARKING],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT],
          },
          {
            location: [8, 8],
            icon: DATA_POINT_TYPE_ICON[DataPointType.PARKING],
            color: DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT],
          },
        ]),
      );

      expect(
        find('.map-control-dropdown-button')[0].nativeElement.textContent,
      ).toContain('Parking');
      expect(find('.observation-item')).toHaveFound(PARKING_DATA_POINTS.length);
    });
  });

  describe('scheduled banners', () => {
    it('should render active scheduled messages', async () => {
      const { find, fixture } = await shallow
        .mock(ScheduledMessagesService, {
          getActiveMessages: jest
            .fn()
            .mockReturnValue(of(ACTIVE_SCHEDULED_MESSAGES)),
          watchActiveMessages: jest
            .fn()
            .mockReturnValue(of(ACTIVE_SCHEDULED_MESSAGES)),
        })
        .render();

      expect(find('.dashboard-message')).toHaveFound(1);
      expect(find('.dashboard-message-warning')).toHaveFound(1);
      expect(find('.dashboard-message h2').nativeElement.innerHTML).toBe(
        'Scheduled maintenance',
      );
      expect(find('.dashboard-message .body-sm').nativeElement.innerHTML).toBe(
        '<p>Map data updates are delayed.</p>',
      );

      find('.dashboard-message-dismiss').triggerEventHandler('click');
      fixture.detectChanges();

      expect(find('.dashboard-message')).toHaveFound(0);
    });

    it('should render a warning banner when fetched sensor history crosses the red threshold', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        {
          timestamp: new Date('2026-04-14T03:00:00Z'),
          value: 15.9,
        },
        {
          timestamp: new Date('2026-04-14T10:23:20Z'),
          value: 26.953995125253883,
        },
      ];

      const { find, findComponent, fixture } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      await fixture.whenStable();
      fixture.detectChanges();

      expect(find('.dashboard-message-warning')).toHaveFound(1);
      expect(find('.dashboard-message h2').nativeElement.textContent).toContain(
        'Use caution near Lappeenranta Weather Hub',
      );
      const content = find('.dashboard-message .body-sm').nativeElement
        .innerHTML;
      expect(content).toContain('Water levels near this sensor may be unsafe');
      expect(content).toContain('Do not walk or drive through floodwater');
      expect(content).toContain('Latest high sensor reading: 26.954');
    });

    it('should not render a warning banner for historical threshold crossings outside the alert window', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        {
          timestamp: new Date('2026-04-13T18:00:00Z'),
          value: 26.953995125253883,
        },
      ];

      const { find, fixture } = await shallow
        .mock(DataPointsApi, {
          getWeatherConditions: jest
            .fn()
            .mockReturnValue(of(WEATHER_CONDITION_DATA_POINTS)),
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(WEATHER_STORM_WATER_DATA_POINTS)),
          getWeatherAirQuality: jest
            .fn()
            .mockReturnValue(of(WEATHER_AIR_QUALITY_DATA_POINTS)),
          getParking: jest.fn().mockReturnValue(of(PARKING_DATA_POINTS)),
          getStormWaterHistory: jest.fn().mockReturnValue(of(sensorHistory)),
          getWaterbagTestKits: jest
            .fn()
            .mockReturnValue(of(WATERBAG_TESTKIT_DATA_POINTS)),
          getRoadWorks: jest.fn().mockReturnValue(of(ROAD_WORKS_DATA_POINTS)),
        })
        .render();

      await fixture.whenStable();
      fixture.detectChanges();

      expect(find('.dashboard-message-warning')).toHaveFound(0);
    });
  });
});

const WEATHER_CONDITION_DATA_POINTS: WeatherConditionDataPoint[] = [
  {
    location: [1, 1],
    type: DataPointType.WEATHER_CONDITIONS,
    quality: DataPointQuality.GOOD,
    name: 'Lappeenranta Weather Station',
    data: {},
  },
  {
    location: [2, 2],
    type: DataPointType.WEATHER_CONDITIONS,
    quality: DataPointQuality.FAIR,
    name: 'Lappeenranta Weather Hub',
    data: {},
  },
  {
    location: [100, 100],
    type: DataPointType.WEATHER_CONDITIONS,
    quality: DataPointQuality.FAIR,
    name: 'Lappeenranta Multi Hub - Conditions',
    data: {},
  },
];

const WEATHER_STORM_WATER_DATA_POINTS: WeatherStormWaterDataPoint[] = [
  {
    location: [3, 3],
    type: DataPointType.STORM_WATER,
    quality: DataPointQuality.GOOD,
    name: 'Lappeenranta Weather Station',
    data: {},
  },
  {
    location: [4, 4],
    type: DataPointType.STORM_WATER,
    quality: DataPointQuality.FAIR,
    name: 'Lappeenranta Weather Hub',
    data: {},
    historySeries: {
      provider: 'intoto',
      seriesId: 121,
      unitLabel: 'meter NN2000',
    },
  },
  {
    location: [100, 100],
    type: DataPointType.STORM_WATER,
    quality: DataPointQuality.FAIR,
    name: 'Lappeenranta Multi Hub - Storm water',
    data: {},
  },
];

const WEATHER_AIR_QUALITY_DATA_POINTS: WeatherAirQualityDataPoint[] = [
  {
    location: [5, 5],
    type: DataPointType.AIR_QUALITY,
    quality: DataPointQuality.GOOD,
    name: 'Air Quality Station 1',
  },
  {
    location: [6, 6],
    type: DataPointType.AIR_QUALITY,
    quality: DataPointQuality.VERY_POOR,
    name: 'Air Quality Station 2',
  },
];

const PARKING_DATA_POINTS: ParkingDataPoint[] = [
  {
    location: [7, 7],
    type: DataPointType.PARKING,
    quality: DataPointQuality.DEFAULT,
    name: 'City Parking',
    availableSpots: 1,
  },
  {
    location: [8, 8],
    type: DataPointType.PARKING,
    quality: DataPointQuality.DEFAULT,
    name: 'Station Parking',
    availableSpots: 2,
  },
];

const ROAD_WORKS_DATA_POINTS: RoadWorksDataPoint[] = [
  {
    location: [9, 9],
    type: DataPointType.ROAD_WORKS,
    quality: DataPointQuality.DEFAULT,
    name: 'Road',
    validFrom: '01.01.2024',
    validTo: '01.02.2024',
  },
  {
    location: [10, 10],
    type: DataPointType.ROAD_WORKS,
    quality: DataPointQuality.DEFAULT,
    name: 'Works',
    validFrom: '01.03.2024',
    validTo: '01.04.2024',
  },
];

const WATERBAG_TESTKIT_DATA_POINTS: WaterbagTestKitDataPoint[] = [
  {
    name: 'Testkit',
    type: DataPointType.WATERBAG_TESTKIT,
    quality: DataPointQuality.DEFAULT,
    lastUpdatedOn: new Date(1711635283),
    location: [61.05871, 28.18871],
    data: {
      airTemp: { value: 1, result: 1 },
      waterTemp: { value: 1, result: 1 },
      visibility: { value: 1, result: 1 },
      waterPh: { value: 1, result: 1 },
      turbidity: { value: 1, result: 1 },
      dissolvedOxygen: { value: 1, result: 1 },
      nitrate: { value: 1, result: 1 },
      phosphate: { value: 1, result: 1 },
    },
  },
];

const ACTIVE_SCHEDULED_MESSAGES: ScheduledMessage[] = [
  {
    id: 'message-1',
    title: 'Scheduled maintenance',
    content: '<p>Map data updates are delayed.</p>',
    start: '2026-02-25 08:00:00.000Z',
    end: '2026-02-25 12:00:00.000Z',
    type: 'warning',
  },
];
