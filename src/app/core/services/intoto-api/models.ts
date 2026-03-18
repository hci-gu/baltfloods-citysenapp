export enum IntotoEndpoint {
  LOCATION_TYPES = 'enums/locationTypes',
  SERIES_CATEGORIES = 'enums/seriesCategories',
  SERIES_SUB_CATEGORIES = 'enums/seriesSubCategories',
  SERIES_AGGREGATION_PERIODS = 'enums/seriesAggregationPeriods',
  SERIES_AGGREGATION_METHODS = 'enums/seriesAggregationMethods',
  SERIES_UNITS = 'enums/seriesUnits',
  MY_AREAS = 'myareas',
  SERIES_DATA = 'series/data',
}

export interface IntotoEnumDto {
  value: number;
  name: string | null;
  description: string | null;
}

export interface IntotoSeriesDataDto {
  error?: boolean;
  timestamp?: string;
  value?: number;
}

export interface IntotoMySeriesDto {
  id: number;
  description: string | null;
  providerInfo: string | null;
  seriesCategory: number;
  seriesSubCategory: number;
  seriesAggregationPeriod: number;
  seriesAggregationMethod: number;
  seriesUnit: number;
}

export interface IntotoMyLocationDto {
  id: number;
  name: string | null;
  locationType: number;
  wgs84latitude: number;
  wgs84longitude: number;
  wgs84elevation: number | null;
  series: IntotoMySeriesDto[] | null;
}

export interface IntotoMyAreaDto {
  id: number;
  name: string | null;
  description: string | null;
  childAreas: IntotoMyAreaDto[] | null;
  locations: IntotoMyLocationDto[] | null;
}

export interface IntotoSeriesDataQuery {
  fromDateTime?: Date | string;
  toDateTime?: Date | string;
}
