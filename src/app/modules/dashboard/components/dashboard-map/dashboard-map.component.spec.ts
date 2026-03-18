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
import { LocationService, UserLocation } from '@core/services/location.service';
import { ObservationRealtimeService } from '@core/services/observation-realtime.service';
import {
  ScheduledMessage,
  ScheduledMessagesService,
} from '@core/services/scheduled-messages.service';
import { TranslateService } from '@ngx-translate/core';
import { MapComponent } from '@shared/components/map/map.component';
import { MessageService, SharedModule } from 'primeng/api';
import { EMPTY, firstValueFrom, of } from 'rxjs';
import { Shallow } from 'shallow-render';
import { DashboardDataPointDetailComponent } from '../dashboard-data-point-detail/dashboard-data-point-detail.component';
import { DashboardMapComponent } from './dashboard-map.component';
import { AsyncPipe } from '@angular/common';
import { SensorHistoryPoint } from '@core/services/datapoints-api/datapoints-api.service';

describe('DashboardMapComponent', () => {
  let shallow: Shallow<DashboardMapComponent>;

  beforeEach(() => {
    shallow = new Shallow(DashboardMapComponent)
      .mock(TranslateService, { instant: jest.fn })
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
        getStormWaterHistory: jest.fn().mockReturnValue(of([] as SensorHistoryPoint[])),
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
        getActiveMessages: jest.fn().mockReturnValue(of([] as ScheduledMessage[])),
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
  });

  describe('markers', () => {
    it('should show marker detail on click and close on close', async () => {
      const { fixture, findComponent } = await shallow.render();

      expect(findComponent(DashboardDataPointDetailComponent)).toHaveFound(0);

      findComponent(MapComponent).markerClick.emit([100, 100]);

      await fixture.whenStable();
      fixture.detectChanges();

      expect(
        findComponent(MapComponent).markers.map(({ active }) => active),
      ).toEqual([
        undefined,
        undefined,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
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
        findComponent(MapComponent).markers.map(({ active }) => active),
      ).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect(findComponent(DashboardDataPointDetailComponent)).toHaveFound(0);
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
            icon: DATA_POINT_TYPE_ICON[DataPointType.STORM_WATER],
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

    it('should default to 1 year with a 30 day active window', async () => {
      const { find, fixture } = await shallow.render();

      expect(find('.timespan-filter-button').nativeElement.textContent).toContain(
        '1 year',
      );
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

    it('should show sensor values over time for an Intoto storm-water point', async () => {
      const sensorHistory: SensorHistoryPoint[] = [
        { timestamp: new Date('2026-03-10T00:00:00Z'), value: 16.7 },
        { timestamp: new Date('2026-03-11T00:00:00Z'), value: 16.9 },
        { timestamp: new Date('2026-03-12T00:00:00Z'), value: 17.1 },
      ];

      const { find, findComponent, fixture, inject } = await shallow
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
      expect(dataPointsApi.getStormWaterHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Lappeenranta Weather Hub',
          historySeries: expect.objectContaining({
            provider: 'intoto',
            seriesId: 121,
          }),
        }),
        expect.any(Date),
        expect.any(Date),
      );
      expect(find('.timeline-header-main h3').nativeElement.textContent).toContain(
        'Sensor values over time',
      );
      expect(find('.timeline-chart[aria-label="Sensor values over time chart"]')).toHaveFound(
        1,
      );
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
            icon: DATA_POINT_TYPE_ICON[DataPointType.STORM_WATER],
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

      find(`[data-type="${DataPointType.WEATHER_CONDITIONS}"]`).triggerEventHandler('click');
      find(`[data-type="${DataPointType.PARKING}"]`).triggerEventHandler('click');
      find(`[data-type="${DataPointType.WEATHER_CONDITIONS}"]`).triggerEventHandler('click'); // toggled off
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

      expect(find('.map-control-dropdown-button')[0].nativeElement.textContent).toContain(
        'Parking',
      );
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

      expect(find('.scheduled-message')).toHaveFound(1);
      expect(find('.scheduled-message h2').nativeElement.innerHTML).toBe(
        'Scheduled maintenance',
      );
      expect(find('.scheduled-message .body-sm').nativeElement.innerHTML).toBe(
        '<p>Map data updates are delayed.</p>',
      );

      find('.scheduled-message-dismiss').triggerEventHandler('click');
      fixture.detectChanges();

      expect(find('.scheduled-message')).toHaveFound(0);
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
  },
];
