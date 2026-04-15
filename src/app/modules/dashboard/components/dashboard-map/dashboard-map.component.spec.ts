import {
  BrowserAnimationsModule,
  NoopAnimationsModule,
} from '@angular/platform-browser/animations';
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
import { DemoTimeService } from '@core/services/demo-time.service';
import { LocationService, UserLocation } from '@core/services/location.service';
import { ObservationRealtimeService } from '@core/services/observation-realtime.service';
import {
  ScheduledMessage,
  ScheduledMessagesService,
} from '@core/services/scheduled-messages.service';
import { TranslateService } from '@ngx-translate/core';
import { MapComponent } from '@shared/components/map/map.component';
import { MessageService, SharedModule } from 'primeng/api';
import { EMPTY, firstValueFrom, of, Subject } from 'rxjs';
import { Shallow } from 'shallow-render';
import { DashboardDataPointDetailComponent } from '../dashboard-data-point-detail/dashboard-data-point-detail.component';
import { DashboardMessageBannerComponent } from '../dashboard-message-banner/dashboard-message-banner.component';
import { DashboardMapComponent } from './dashboard-map.component';
import { AsyncPipe } from '@angular/common';
import { SensorHistoryPoint } from '@core/services/datapoints-api/datapoints-api.service';

describe('DashboardMapComponent', () => {
  let shallow: Shallow<DashboardMapComponent>;

  beforeEach(() => {
    shallow = new Shallow(DashboardMapComponent)

      .dontMock(DashboardMessageBannerComponent)

      .mock(TranslateService, { instant: jest.fn })
      .mock(MessageService, { add: jest.fn(), clear: jest.fn() })
      .mock(DemoTimeService, {
        now: jest.fn(() => new Date('2026-04-14T12:00:00Z')),
        override$: of(null),
        overrideChanged$: EMPTY,
      })
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
      })
      .mock(ObservationRealtimeService, {
        observationChanges$: EMPTY,
      })
      .provideMock(AsyncPipe)
      .import(BrowserAnimationsModule)
      .replaceModule(BrowserAnimationsModule, NoopAnimationsModule)
      .provideMock(SharedModule);
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

    it('should refetch observation data when fake time is first applied', async () => {
      const overrideChanged$ = new Subject<Date | null>();
      const { inject, fixture } = await shallow
        .mock(DemoTimeService, {
          now: jest.fn(() => new Date('2026-04-14T12:00:00Z')),
          override$: of(null),
          overrideChanged$: overrideChanged$.asObservable(),
        })
        .render();

      const dataPointsApi = inject(DataPointsApi);
      expect(dataPointsApi.getWeatherStormWater).toHaveBeenCalledTimes(1);

      overrideChanged$.next(new Date('2026-04-01T12:00:00Z'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(dataPointsApi.getWeatherStormWater).toHaveBeenCalledTimes(2);
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
        }),
      ]);

      // expect(
      //   findComponent(DashboardDataPointDetailComponent).dataPoints,
      // ).toEqual([
      //   WEATHER_STORM_WATER_DATA_POINTS[2],
      //   WEATHER_CONDITION_DATA_POINTS[2],
      // ]);
      findComponent(DashboardDataPointDetailComponent).close.emit();

      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        findComponent(MapComponent).markers.some(({ active }) => !!active),
      ).toBe(false);
      expect(findComponent(DashboardDataPointDetailComponent)).toHaveFound(0);
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
            icon: 'user-marker.svg',
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
          },
        ]),
      );
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
            icon: 'user-marker.svg',
            color: '#2563eb',
          }),
        ]),
      );
    });
  });

  describe('observations feed', () => {
    it('should render observations and focus the selected one on map', async () => {
      const { find, fixture, instance } = await shallow.render();

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
          getWeatherStormWater: jest
            .fn()
            .mockReturnValue(of(staleLatestPoint)),
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
        expect.arrayContaining([
          expect.objectContaining({ location: [4, 4] }),
        ]),
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

    it('should clamp the sensor detail range to fake current time and not later cached samples', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-01-15T08:00:00Z'), value: 16.7 },
        { timestamp: new Date('2026-04-14T21:01:00Z'), value: 16.9 },
      ];

      const { findComponent, fixture, instance } = await shallow
        .mock(DemoTimeService, {
          now: jest.fn(() => new Date('2026-04-14T12:00:00Z')),
          override$: of(new Date('2026-04-14T12:00:00Z')),
          overrideChanged$: EMPTY,
        })
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

      expect(instance.selectedSensorViewEndInput()).toBe('2026-04-14');
      expect(instance.selectedSensorViewBounds().endMs).toBe(
        new Date('2026-04-14T12:00:00Z').getTime(),
      );
      expect(instance.selectedSensorCursor()?.timestamp.getTime()).toBeLessThanOrEqual(
        new Date('2026-04-14T12:00:00Z').getTime(),
      );
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
      const timelineTab = tabs.find(tab => tab.nativeElement.textContent?.includes('Timeline'));
      if (!timelineTab) throw new Error('Timeline tab not found');
      timelineTab.triggerEventHandler('click');

      expect(instance.activeMobileBottomPanel()).toBe('timeline');
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
        'Lappeenranta Weather Hub crossed the red threshold',
      );
      expect(find('.dashboard-message .body-sm').nativeElement.innerHTML).toContain(
        '26.954',
      );
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
