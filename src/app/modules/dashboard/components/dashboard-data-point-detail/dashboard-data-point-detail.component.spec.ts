import {
  DATA_POINT_QUALITY_COLOR_CHART,
  DataPoint,
  DataPointQuality,
  DataPointType,
  ParkingDataPoint,
  RoadWorksDataPoint,
  WaterbagTestKitDataPoint,
  WeatherAirQualityDataPoint,
  WeatherConditionDataPoint,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { RadarService } from '@core/services/radar.service';
import { environment } from '@environments/environment';
import { TranslateService } from '@ngx-translate/core';
import { SharedModule } from 'primeng/api';
import { Chip } from 'primeng/chip';
import { Shallow } from 'shallow-render';
import { DashboardDataPointDetailComponent } from './dashboard-data-point-detail.component';
import { DatePipe, KeyValuePipe } from '@angular/common';

// jest.useFakeTimers();

describe('DashboardDataPointDetailComponent', () => {
  let shallow: Shallow<DashboardDataPointDetailComponent>;

  const address = 'Huopatehtaankatu 4';

  beforeEach(() => {
    shallow = new Shallow(DashboardDataPointDetailComponent)
      .mock(TranslateService, { instant: jest.fn((key) => key) })
      .mock(RadarService, {
        reverseGeocode: jest.fn().mockReturnValue(address),
      })
      .provideMock(DatePipe)
      .provideMock(KeyValuePipe)
      .provideMock(SharedModule);
  });

  describe('data points input', () => {
    it('should search and display address and name if data point is provided', async () => {
      const dataPoints = [
        {
          type: DataPointType.WEATHER_CONDITIONS,
          location: [123, 456],
          quality: DataPointQuality.GOOD,
          name: 'Point 1',
        },
        {
          type: DataPointType.STORM_WATER,
          location: [123, 456],
          quality: DataPointQuality.GOOD,
          name: 'Point 2',
          data: { fillLevel: 2 },
        },
      ];

      const { inject, fixture, find } = await shallow.render(
        '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
        { bind: { dataPoints } },
      );
      const radarService = inject(RadarService);

      fixture.detectChanges();

      expect(radarService.reverseGeocode).toHaveBeenCalledWith([123, 456]);
      expect(find('p')[0].nativeElement.innerHTML).toBe(address);
      expect(find('h1').nativeElement.innerHTML).toBe('Point 1');
      expect(
        find('.detail-navigation-count').nativeElement.textContent,
      ).toContain('1 / 2');
    });

    describe('it should show the correct information by type', () => {
      it('when type is storm water point', async () => {
        const name = 'Lappeenranta Weather Station';

        const dataPoints: WeatherStormWaterDataPoint[] = [
          {
            name,
            type: DataPointType.STORM_WATER,
            quality: DataPointQuality.DEFAULT,
            data: {
              fillLevel: 3,
            },
            lastUpdatedOn: new Date(1711635283),
            location: [61.05871, 28.18871],
          },
        ];

        const { fixture, find } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        fixture.detectChanges();

        expect(find('.metric-container')).toHaveFound(1);
        expect(find('h1').nativeElement.innerHTML).toEqual(name);
        expect(find('p.body-xs').nativeElement.innerHTML).toEqual(address);
        expect(find('li').length).toEqual(3);
      });

      it('when type is intoto sensor storm water point', async () => {
        const dataPoints: WeatherStormWaterDataPoint[] = [
          {
            name: 'Boen bru',
            type: DataPointType.STORM_WATER,
            quality: DataPointQuality.DEFAULT,
            data: {
              waterLevel: 19.7,
            },
            lastUpdatedOn: new Date(1711635283 * 1000),
            location: [58.25, 8.15],
            dataUnitOverrides: {
              waterLevel: 'meter NN2000',
            },
            historySeries: {
              provider: 'intoto',
              seriesId: 121,
              unitLabel: 'meter NN2000',
            },
          },
        ];

        const { fixture, find } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        await fixture.whenStable();
        fixture.detectChanges();

        expect(find('.sensor-detail')).toHaveFound(1);
        expect(
          find('.sensor-detail-value').nativeElement.textContent.trim(),
        ).toBe('19.7');
        expect(
          find('.sensor-detail-status-copy').nativeElement.textContent,
        ).toContain('Above the highest configured threshold.');
        expect(
          find('.sensor-detail-meta').nativeElement.textContent,
        ).toContain('Yellow 18 MASL');
      });

      it('when type is weather condition', async () => {
        const name = 'Hurricane Delta';

        const dataPoints: WeatherConditionDataPoint[] = [
          {
            name,
            type: DataPointType.WEATHER_CONDITIONS,
            quality: DataPointQuality.DEFAULT,
            data: {
              humidity: 60,
              streetState: 'icy',
              temperature: -4,
            },
            lastUpdatedOn: new Date(1711635283),
            location: [61.05871, 28.18871],
          },
        ];

        const { fixture, find } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        fixture.detectChanges();

        expect(find('.metric-container')).toHaveFound(1);
        expect(find('h1').nativeElement.innerHTML).toEqual(name);
        expect(find('p.body-xs').nativeElement.innerHTML).toEqual(address);
        expect(find('li').length).toEqual(
          Object.keys(dataPoints[0].data).length + 1,
        );
      });

      it('when type is weather air quality', async () => {
        const name = 'Air Quality Station';
        const quality = DataPointQuality.GOOD;

        const dataPoints: WeatherAirQualityDataPoint[] = [
          {
            name,
            type: DataPointType.AIR_QUALITY,
            quality,
            lastUpdatedOn: new Date(1711635283),
            location: [61.05871, 28.18871],
          },
        ];

        const { fixture, find, findComponent } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        await fixture.whenStable();
        fixture.detectChanges();

        expect(find('.metric-container')).toHaveFound(1);
        expect(find('h1').nativeElement.innerHTML).toEqual(name);
        expect(find('p.body-xs').nativeElement.innerHTML).toEqual(address);
        expect(find('p.button-sm').length).toEqual(2);
        expect(findComponent(Chip)?.style?.['background-color']).toEqual(
          DATA_POINT_QUALITY_COLOR_CHART[quality],
        );
      });

      it('when type is waterbag testkit', async () => {
        const name = 'Testkit';
        const quality = DataPointQuality.GOOD;
        const imageUrl = '/api/files/observations/testkit-id/photo.jpg';

        const dataPoints: WaterbagTestKitDataPoint[] = [
          {
            name,
            type: DataPointType.WATERBAG_TESTKIT,
            quality,
            lastUpdatedOn: new Date(1711635283),
            location: [61.05871, 28.18871],
            imageUrl,
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

        const { fixture, find, findComponent } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        await fixture.whenStable();
        fixture.detectChanges();

        expect(find('.metric-container')).toHaveFound(1);
        expect(find('h1').nativeElement.innerHTML).toEqual(
          'DASHBOARD.DATA_POINTS.WATERBAG_TESTKIT.TITLE',
        );
        expect(find('p.body-xs').nativeElement.innerHTML).toEqual(address);
        expect(findComponent(Chip).length).toEqual(8);
        expect(find('.observation-image')).toHaveFound(1);
        expect(
          find('.observation-image').nativeElement.getAttribute('src'),
        ).toBe(imageUrl);
      });

      it('when type is parking', async () => {
        const name = 'City Parking';
        const quality = DataPointQuality.DEFAULT;

        const dataPoints: ParkingDataPoint[] = [
          {
            name,
            quality,
            type: DataPointType.PARKING,
            location: [61.05871, 28.18871],
            availableSpots: 1,
            lastUpdatedOn: new Date(1728453600 * 1000),
          },
        ];

        const { fixture, find } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        await fixture.whenStable();
        fixture.detectChanges();

        expect(find('.metric-container')).toHaveFound(1);
        expect(find('h1').nativeElement.innerHTML).toEqual(name);
        expect(find('p.body-xs').nativeElement.innerHTML).toEqual(address);
        expect(find('p.button-sm').length).toEqual(2);
        expect(find('small.body-sm').nativeElement.innerHTML).toEqual('1');
      });

      it('when type is road works', async () => {
        const name = 'Road works';
        const quality = DataPointQuality.DEFAULT;

        const dataPoints: RoadWorksDataPoint[] = [
          {
            name,
            quality,
            type: DataPointType.ROAD_WORKS,
            location: [61.05871, 28.18871],
            validFrom: '01.01.2024',
            validTo: '01.02.2024',
          },
        ];

        const { fixture, find } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        await fixture.whenStable();
        fixture.detectChanges();

        expect(find('.metric-container')).toHaveFound(1);
        expect(find('h1').nativeElement.innerHTML).toEqual(name);
        expect(find('p.body-xs').nativeElement.innerHTML).toEqual(address);
        expect(find('p.button-sm').length).toEqual(2);
      });

      it('should navigate between multiple data points', async () => {
        const quality = DataPointQuality.DEFAULT;

        const dataPoints: DataPoint[] = [
          {
            name: 'Weather hub',
            quality,
            type: DataPointType.WEATHER_CONDITIONS,
            location: [61.05871, 28.18871],
            data: {},
            lastUpdatedOn: new Date(1711635283 * 1000),
          },
          {
            name: 'City Parking',
            quality,
            type: DataPointType.PARKING,
            location: [61.05871, 28.18871],
            availableSpots: 1,
            lastUpdatedOn: new Date(1731050040 * 1000),
          },
        ];

        const { fixture, find } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        await fixture.whenStable();
        fixture.detectChanges();

        expect(find('.metric-container')).toHaveFound(1);
        expect(find('h1').nativeElement.innerHTML).toEqual('Weather hub');
        expect(find('p.body-xs').nativeElement.innerHTML).toEqual(address);
        expect(
          find('.detail-navigation-count').nativeElement.textContent,
        ).toContain('1 / 2');

        find('.detail-navigation-button.next').triggerEventHandler('click', {});
        await fixture.whenStable();
        fixture.detectChanges();

        expect(find('h1').nativeElement.innerHTML).toEqual('City Parking');
        expect(
          find('.detail-navigation-count').nativeElement.textContent,
        ).toContain('2 / 2');
        expect(find('small.body-sm').nativeElement.innerHTML).toEqual('1');
      });

      it('should swipe between multiple data points', async () => {
        const dataPoints: DataPoint[] = [
          {
            name: 'Weather hub',
            quality: DataPointQuality.DEFAULT,
            type: DataPointType.WEATHER_CONDITIONS,
            location: [61.05871, 28.18871],
            data: {},
          },
          {
            name: 'City Parking',
            quality: DataPointQuality.DEFAULT,
            type: DataPointType.PARKING,
            location: [61.05871, 28.18871],
            availableSpots: 1,
          },
        ];

        const { fixture, instance } = await shallow.render(
          '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
          { bind: { dataPoints } },
        );

        await fixture.whenStable();
        instance.onTouchStart({
          changedTouches: [{ clientX: 120 }],
        } as unknown as TouchEvent);
        instance.onTouchEnd({
          changedTouches: [{ clientX: 40 }],
        } as unknown as TouchEvent);

        expect(instance.activeDataPointIndex()).toBe(1);
        expect(instance.activeDataPoint()?.name).toBe('City Parking');
      });
    });
  });

  describe('image urls', () => {
    const minimalDataPoints: WeatherConditionDataPoint[] = [
      {
        type: DataPointType.WEATHER_CONDITIONS,
        location: [1, 1],
        quality: DataPointQuality.DEFAULT,
        name: 'Point',
        data: {},
      },
    ];

    it('should keep pocketbase api file paths', async () => {
      const { instance } = await shallow.render(
        '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
        { bind: { dataPoints: minimalDataPoints } },
      );

      expect(
        instance.getDataPointImageUrl(
          'api/files/observations/abc123/photo.png',
        ),
      ).toBe('/api/files/observations/abc123/photo.png');
      expect(
        instance.getDataPointImageUrl(
          '../api/files/observations/abc123/photo.png',
        ),
      ).toBe('/api/files/observations/abc123/photo.png');
    });

    it('should prefix legacy relative uploads with street ai upload url', async () => {
      const { instance } = await shallow.render(
        '<app-dashboard-data-point-detail [dataPoints]="dataPoints"></app-dashboard-data-point-detail>',
        { bind: { dataPoints: minimalDataPoints } },
      );

      expect(
        instance.getDataPointImageUrl('uploads/waterbag/example.jpg'),
      ).toBe(`${environment.streetAiUploadUrl}/uploads/waterbag/example.jpg`);
    });
  });
});
