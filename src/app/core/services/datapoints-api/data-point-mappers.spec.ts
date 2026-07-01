import { DataPointQuality, DataPointType } from '../../models/data-point';
import {
  mapObservationWaterbag,
  mapStreetAiStormWater,
  mapWeatherAirQuality,
} from './data-point-mappers';

describe('data point mappers', () => {
  beforeEach(() => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-03-20T12:00:00Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should map StreetAI storm water response values', () => {
    expect(
      mapStreetAiStormWater([
        {
          name: 'Storm water well',
          latitude: 61.06343,
          longitude: 28.18027,
          dataRetrievedTimestamp: 1711635283,
          waterLevel: 12,
          waterTemperature: 4,
          flowRate: 2,
          fillLevel: {
            value: 75,
            result: 2,
          },
          waterQuality: DataPointQuality.FAIR,
        },
      ]),
    ).toEqual([
      {
        name: 'Storm water well',
        location: [61.06343, 28.18027],
        lastUpdatedOn: new Date(1711635283 * 1000),
        type: DataPointType.STORM_WATER,
        quality: DataPointQuality.FAIR,
        data: {
          fillLevel: 2,
        },
      },
    ]);
  });

  it('should fall back to default air quality when measurement index is unknown', () => {
    expect(
      mapWeatherAirQuality([
        {
          name: 'Air Quality Station',
          latitude: 61.05871,
          longitude: 28.18871,
          dataRetrievedTimestamp: 1711635283,
          measurementIndex: 99,
        },
      ]),
    ).toEqual([
      {
        name: 'Air Quality Station',
        location: [61.05871, 28.18871],
        lastUpdatedOn: new Date(1711635283 * 1000),
        type: DataPointType.AIR_QUALITY,
        quality: DataPointQuality.DEFAULT,
      },
    ]);
  });

  it('should map uploaded water observations with fallback names and filtered metrics', () => {
    expect(
      mapObservationWaterbag([
        {
          id: 'uploaded-1',
          latitude: 57.7089,
          longitude: 11.9746,
          dataRetrievedTimestamp: 1770000000,
          created: '2026-04-12 10:00:02.000Z',
          imageUrl: ' /api/files/observations/uploaded-1/photo.jpg ',
          observationType: 'water_overflow',
          airTemp: 12,
          waterTemp: null,
          algaeLevel: 'rich',
        },
      ]),
    ).toEqual([
      {
        name: 'Water overflow upload',
        location: [57.7089, 11.9746],
        imageUrl: '/api/files/observations/uploaded-1/photo.jpg',
        type: DataPointType.WATERBAG_TESTKIT,
        quality: DataPointQuality.DEFAULT,
        lastUpdatedOn: new Date(1770000000 * 1000),
        createdOn: new Date('2026-04-12 10:00:02.000Z'),
        data: {
          airTemp: {
            value: 12,
            dataRetrievedTimestamp: 1770000000,
          },
          algae: {
            value: 3,
            dataRetrievedTimestamp: 1770000000,
          },
        },
      },
    ]);
  });
});

