import {
  DataPointQuality,
  DataPointType,
  ParkingDataPoint,
  QUALITY_CONVERSION,
  RoadWorksDataPoint,
  WaterbagTestKitDataPoint,
  WeatherAirQualityDataPoint,
  WeatherConditionDataPoint,
  WeatherStormWaterDataPoint,
} from '../../models/data-point';
import { removeEmpty } from '../../../shared/utils/object-utils';
import {
  ObservationWaterResponse,
  ParkingResponse,
  RoadWorksResponse,
  WaterbagTestKitResponse,
  WeatherAirQualityResponse,
  WeatherConditionsResponse,
  WeatherStormWaterResponse,
} from './models';

export function mapWeatherConditions(
  response: WeatherConditionsResponse,
): WeatherConditionDataPoint[] {
  return response.map(
    ({ name, latitude, longitude, dataRetrievedTimestamp, ...rest }) => ({
      name,
      location: [latitude, longitude],
      lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
      type: DataPointType.WEATHER_CONDITIONS,
      quality: DataPointQuality.DEFAULT,
      data: { ...removeEmpty(rest) },
    }),
  );
}

export function mapStreetAiStormWater(
  response: WeatherStormWaterResponse,
): WeatherStormWaterDataPoint[] {
  return response.map(
    ({
      name,
      latitude,
      longitude,
      waterQuality,
      fillLevel,
      dataRetrievedTimestamp,
    }) => ({
      name,
      location: [latitude, longitude],
      lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
      type: DataPointType.STORM_WATER,
      quality: waterQuality,
      data: {
        fillLevel: fillLevel.result,
      },
    }),
  );
}

export function mapWeatherAirQuality(
  response: WeatherAirQualityResponse,
): WeatherAirQualityDataPoint[] {
  return response.map(
    ({
      name,
      latitude,
      longitude,
      measurementIndex,
      dataRetrievedTimestamp,
    }) => ({
      name,
      location: [latitude, longitude],
      lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
      type: DataPointType.AIR_QUALITY,
      quality: QUALITY_CONVERSION[measurementIndex] ?? DataPointQuality.DEFAULT,
    }),
  );
}

export function mapParking(response: ParkingResponse): ParkingDataPoint[] {
  return response.map(
    ({
      name,
      latitude,
      longitude,
      availableSpots,
      dataRetrievedTimestamp,
    }) => ({
      name,
      location: [latitude, longitude],
      lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
      type: DataPointType.PARKING,
      quality: DataPointQuality.DEFAULT,
      availableSpots,
    }),
  );
}

export function mapRoadWorks(
  response: RoadWorksResponse,
): RoadWorksDataPoint[] {
  return response.map(({ name, latitude, longitude, validityPeriod }) => {
    const [from, to] = validityPeriod.split(' - ');

    return {
      name,
      location: [latitude, longitude],
      type: DataPointType.ROAD_WORKS,
      quality: DataPointQuality.DEFAULT,
      validFrom: from,
      validTo: to,
    };
  });
}

export function mapStreetAiWaterbag(
  response: WaterbagTestKitResponse,
): WaterbagTestKitDataPoint[] {
  return response.map(({ id, coords, ...rest }) => {
    const { dataRetrievedTimestamp, imageUrl, ...data } = rest;

    return {
      name: id,
      location: [coords.latitudeValue, coords.longitudeValue],
      imageUrl,
      type: DataPointType.WATERBAG_TESTKIT,
      quality: DataPointQuality.DEFAULT,
      lastUpdatedOn: new Date(dataRetrievedTimestamp * 1000),
      data: Object.fromEntries(
        Object.entries(data).filter(([, metric]) => metric.value !== null),
      ),
    };
  });
}

export function mapObservationWaterbag(
  response: ObservationWaterResponse,
): WaterbagTestKitDataPoint[] {
  return response.map((item) => {
    const dataTimestamp =
      item.dataRetrievedTimestamp ?? Math.floor(Date.now() / 1000);
    const algaeValue = mapAlgaeLevel(item.algaeLevel);
    const fallbackNamePrefix =
      item.observationType === 'water_overflow'
        ? 'Water overflow'
        : item.observationType === 'stormwater'
          ? 'Storm water observation'
          : item.observationType === 'water_system'
            ? 'Water system observation'
            : 'Water observation';
    const fallbackId = item.id.slice(0, 6);
    const name = item.name?.trim() || `${fallbackNamePrefix} ${fallbackId}`;

    const data = {
      airTemp: toMetric(item.airTemp, dataTimestamp),
      waterTemp: toMetric(item.waterTemp, dataTimestamp),
      visibility: toMetric(item.depthOfView, dataTimestamp),
      algae: algaeValue ? toMetric(algaeValue, dataTimestamp) : null,
      waterPh: toMetric(item.waterPh, dataTimestamp),
      turbidity: toMetric(item.turbidity, dataTimestamp),
      dissolvedOxygen: toMetric(item.dissolvedOxygen, dataTimestamp),
      nitrate: toMetric(item.nitrate, dataTimestamp),
      phosphate: toMetric(item.phosphate, dataTimestamp),
    };

    const filteredData = Object.fromEntries(
      Object.entries(data).filter(
        (
          entry,
        ): entry is [
          string,
          { value: number; dataRetrievedTimestamp: number },
        ] => {
          const metric = entry[1];
          return (
            metric !== null &&
            metric.value !== null &&
            metric.value !== undefined
          );
        },
      ),
    );

    return {
      name,
      location: [item.latitude, item.longitude],
      imageUrl:
        typeof item.imageUrl === 'string' && item.imageUrl.trim().length > 0
          ? item.imageUrl.trim()
          : undefined,
      type: DataPointType.WATERBAG_TESTKIT,
      quality: DataPointQuality.DEFAULT,
      lastUpdatedOn: new Date(dataTimestamp * 1000),
      createdOn: parseOptionalDate(item.created),
      data: filteredData,
    };
  });
}

function parseOptionalDate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toMetric(
  value: number | null | undefined,
  timestamp: number,
): { value: number; dataRetrievedTimestamp: number } | null {
  if (value === null || value === undefined) {
    return null;
  }

  return {
    value,
    dataRetrievedTimestamp: timestamp,
  };
}

function mapAlgaeLevel(value: string | null | undefined): number | null {
  switch (value) {
    case 'none':
      return 1;
    case 'little':
      return 2;
    case 'rich':
      return 3;
    case 'very_rich':
      return 4;
    default:
      return null;
  }
}
