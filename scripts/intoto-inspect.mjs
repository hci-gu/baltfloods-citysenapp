import fs from 'node:fs/promises';
import path from 'node:path';

const cwd = process.cwd();
const environmentFile = path.join(
  cwd,
  'src/environments/environment.development.ts',
);
const reportsDir = path.join(cwd, 'reports');

const ROAD_THRESHOLDS = [
  {
    name: 'Small local road',
    location: {
      latitude: 58.250283,
      longitude: 8.159909,
    },
    thresholdsMasl: {
      yellow: 18.0,
      orange: 18.5,
    },
  },
  {
    name: 'Bigger road',
    location: {
      latitude: 58.249162,
      longitude: 8.156991,
    },
    thresholdsMasl: {
      yellow: 18.4,
      orange: 19.5,
    },
  },
];

async function main() {
  const config = await loadConfig();
  const api = createApiClient(config);

  console.log(`Using Intoto base URL: ${config.baseUrl}`);

  const [
    locationTypes,
    seriesCategories,
    seriesSubCategories,
    seriesAggregationPeriods,
    seriesAggregationMethods,
    seriesUnits,
    myAreas,
  ] = await Promise.all([
    api.get('enums/locationTypes'),
    api.get('enums/seriesCategories'),
    api.get('enums/seriesSubCategories'),
    api.get('enums/seriesAggregationPeriods'),
    api.get('enums/seriesAggregationMethods'),
    api.get('enums/seriesUnits'),
    api.get('myareas'),
  ]);

  const enums = {
    locationTypes: toEnumMap(locationTypes),
    seriesCategories: toEnumMap(seriesCategories),
    seriesSubCategories: toEnumMap(seriesSubCategories),
    seriesAggregationPeriods: toEnumMap(seriesAggregationPeriods),
    seriesAggregationMethods: toEnumMap(seriesAggregationMethods),
    seriesUnits: toEnumMap(seriesUnits),
  };

  const normalizedAreas = normalizeCollection(myAreas);
  const flattenedAreas = flattenAreas(normalizedAreas);
  const kristiansandAreas = flattenedAreas.filter((area) =>
    (area.name ?? '').toLowerCase().includes('kristiansand'),
  );

  const targetAreas =
    kristiansandAreas.length > 0 ? kristiansandAreas : flattenedAreas;

  const areaSummaries = targetAreas.map((area) =>
    summarizeArea(area, enums, ROAD_THRESHOLDS),
  );

  const candidateSeries = areaSummaries.flatMap((area) =>
    area.locations.flatMap((location) =>
      location.series
        .filter((series) => series.isLikelyWaterLevel)
        .map((series) => ({
          areaName: area.name,
          locationName: location.name,
          locationCoordinates: location.coordinates,
          series,
        })),
    ),
  );

  const windows = buildWindows();
  const seriesSamples = [];

  for (const candidate of candidateSeries) {
    const fetchedWindows = [];

    for (const window of windows) {
      const data = await api.get(
        `series/data/${candidate.series.id}${toQueryString(window.query)}`,
      );

      fetchedWindows.push({
        label: window.label,
        query: window.query,
        summary: summarizeSeriesData(data, ROAD_THRESHOLDS),
        sample: data.slice(0, 5),
        lastSample: data.slice(-5),
      });
    }

    seriesSamples.push({
      areaName: candidate.areaName,
      locationName: candidate.locationName,
      locationCoordinates: candidate.locationCoordinates,
      series: candidate.series,
      fetchedWindows,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      baseUrl: config.baseUrl,
      usedApiKeyFrom:
        process.env.INTOTO_API_KEY || process.env.INTO_TO_API_KEY
          ? 'process.env'
          : environmentFile,
    },
    thresholds: ROAD_THRESHOLDS,
    counts: {
      totalAreas: flattenedAreas.length,
      matchedKristiansandAreas: kristiansandAreas.length,
      inspectedAreas: targetAreas.length,
      candidateSeries: candidateSeries.length,
    },
    rawResponseShape: {
      myAreasType: Array.isArray(myAreas) ? 'array' : typeof myAreas,
      myAreasKeys:
        myAreas && typeof myAreas === 'object' ? Object.keys(myAreas) : [],
      myAreasPreview:
        myAreas && typeof myAreas === 'object'
          ? safePreview(myAreas)
          : myAreas,
    },
    areaSummaries,
    seriesSamples,
  };

  await fs.mkdir(reportsDir, { recursive: true });
  const outputPath = path.join(reportsDir, 'intoto-inspect-report.json');
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  printConsoleSummary(report, outputPath);
}

async function loadConfig() {
  const envSource = await fs.readFile(environmentFile, 'utf8');
  const baseUrl =
    process.env.INTOTO_API_URL ||
    process.env.INTO_TO_API_URL ||
    extractEnvironmentString(envSource, 'intoToApiUrl');
  const apiKey =
    process.env.INTOTO_API_KEY ||
    process.env.INTO_TO_API_KEY ||
    extractEnvironmentString(envSource, 'intoToApiKey');

  if (!baseUrl) {
    throw new Error(
      'Could not resolve Intoto base URL from environment.development.ts or process env.',
    );
  }

  if (!apiKey) {
    throw new Error(
      'Could not resolve Intoto API key from environment.development.ts or process env.',
    );
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
}

function extractEnvironmentString(source, key) {
  const match = source.match(new RegExp(`${key}:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

function createApiClient(config) {
  return {
    async get(pathname) {
      const response = await fetch(`${config.baseUrl}/${pathname}`, {
        headers: {
          'x-api-key': config.apiKey,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Intoto request failed for ${pathname}: ${response.status} ${response.statusText}\n${body}`,
        );
      }

      return response.json();
    },
  };
}

function toEnumMap(items) {
  return new Map(normalizeCollection(items).map((item) => [item.value, item]));
}

function flattenAreas(areas, parentPath = []) {
  return areas.flatMap((area) => {
    const currentPath = [...parentPath, area.name ?? `Area ${area.id}`];
    const current = [{ ...area, path: currentPath }];
    const children = flattenAreas(area.childAreas ?? [], currentPath);
    return [...current, ...children];
  });
}

function normalizeCollection(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  if (Array.isArray(value.items)) {
    return value.items;
  }

  if (Array.isArray(value.data)) {
    return value.data;
  }

  if (value.data && typeof value.data === 'object') {
    return normalizeCollection(value.data);
  }

  if (Array.isArray(value.value)) {
    return value.value;
  }

  if (Array.isArray(value.$values)) {
    return value.$values;
  }

  return [];
}

function safePreview(value) {
  try {
    return JSON.parse(JSON.stringify(value)).data?.slice?.(0, 2) ?? value;
  } catch {
    return '[unserializable]';
  }
}

function summarizeArea(area, enums, thresholds) {
  return {
    id: area.id,
    name: area.name,
    description: area.description,
    path: area.path,
    locationCount: area.locations?.length ?? 0,
    childAreaCount: area.childAreas?.length ?? 0,
    locations: (area.locations ?? []).map((location) =>
      summarizeLocation(location, enums, thresholds),
    ),
  };
}

function summarizeLocation(location, enums, thresholds) {
  const coordinates = {
    latitude: location.wgs84latitude,
    longitude: location.wgs84longitude,
    elevation: location.wgs84elevation,
  };

  return {
    id: location.id,
    name: location.name,
    coordinates,
    locationType: resolveEnum(enums.locationTypes, location.locationType),
    nearbyRoadThresholds: thresholds
      .map((road) => ({
        ...road,
        distanceKm: haversineKm(
          coordinates.latitude,
          coordinates.longitude,
          road.location.latitude,
          road.location.longitude,
        ),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm),
    series: (location.series ?? []).map((series) =>
      summarizeSeries(series, enums),
    ),
  };
}

function summarizeSeries(series, enums) {
  const description = series.description ?? '';
  const category = resolveEnum(enums.seriesCategories, series.seriesCategory);
  const subCategory = resolveEnum(
    enums.seriesSubCategories,
    series.seriesSubCategory,
  );
  const aggregationPeriod = resolveEnum(
    enums.seriesAggregationPeriods,
    series.seriesAggregationPeriod,
  );
  const aggregationMethod = resolveEnum(
    enums.seriesAggregationMethods,
    series.seriesAggregationMethod,
  );
  const unit = resolveEnum(enums.seriesUnits, series.seriesUnit);

  const haystack = [
    description,
    category.name,
    subCategory.name,
    subCategory.description,
    unit.name,
    unit.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const isLikelyWaterLevel =
    category.name?.toLowerCase() === 'water' &&
    /(level|distance|depth|nn2000|rh2000|masl|water)/.test(haystack);

  return {
    id: series.id,
    description: series.description,
    providerInfo: series.providerInfo,
    category,
    subCategory,
    aggregationPeriod,
    aggregationMethod,
    unit,
    isLikelyWaterLevel,
  };
}

function resolveEnum(enumMap, value) {
  const item = enumMap.get(value);
  return {
    value,
    name: item?.name ?? null,
    description: item?.description ?? null,
  };
}

function buildWindows() {
  const now = new Date();
  const recentFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return [
    {
      label: 'last_24_hours',
      query: {
        fromDateTime: recentFrom.toISOString(),
        toDateTime: now.toISOString(),
      },
    },
    {
      label: 'exercise_september_2025',
      query: {
        fromDateTime: '2025-09-01T00:00:00.000Z',
        toDateTime: '2025-10-01T00:00:00.000Z',
      },
    },
  ];
}

function toQueryString(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

function summarizeSeriesData(data, thresholds) {
  const values = data
    .map((entry) => entry.value)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  const timestamps = data
    .map((entry) => entry.timestamp)
    .filter((value) => typeof value === 'string');

  const maxValue = values.length > 0 ? Math.max(...values) : null;

  return {
    pointCount: data.length,
    nonErrorCount: data.filter((entry) => entry.error !== true).length,
    firstTimestamp: timestamps[0] ?? null,
    lastTimestamp: timestamps.at(-1) ?? null,
    minValue: values.length > 0 ? Math.min(...values) : null,
    maxValue,
    thresholdHits: thresholds.map((road) => ({
      roadName: road.name,
      yellowReached:
        maxValue !== null ? maxValue >= road.thresholdsMasl.yellow : false,
      orangeReached:
        maxValue !== null ? maxValue >= road.thresholdsMasl.orange : false,
    })),
  };
}

function printConsoleSummary(report, outputPath) {
  console.log('');
  console.log('Area summary:');

  for (const area of report.areaSummaries) {
    console.log(`- ${area.name ?? `Area ${area.id}`} (${area.locationCount} locations)`);

    for (const location of area.locations) {
      console.log(
        `  Location: ${location.name ?? `Location ${location.id}`} @ ${location.coordinates.latitude}, ${location.coordinates.longitude}`,
      );

      for (const series of location.series) {
        console.log(
          `    Series ${series.id}: ${series.description ?? 'No description'} | category=${series.category.name ?? series.category.value} | subCategory=${series.subCategory.name ?? series.subCategory.value} | unit=${series.unit.name ?? series.unit.value} | likelyWaterLevel=${series.isLikelyWaterLevel}`,
        );
      }
    }
  }

  console.log('');
  console.log('Series sample summary:');

  if (report.seriesSamples.length === 0) {
    console.log('- No likely water-level series matched the current heuristic.');
  }

  for (const item of report.seriesSamples) {
    console.log(
      `- ${item.areaName} / ${item.locationName} / series ${item.series.id} (${item.series.description ?? 'No description'})`,
    );

    for (const window of item.fetchedWindows) {
      console.log(
        `  ${window.label}: count=${window.summary.pointCount}, first=${window.summary.firstTimestamp}, last=${window.summary.lastTimestamp}, min=${window.summary.minValue}, max=${window.summary.maxValue}`,
      );
    }
  }

  console.log('');
  console.log(`Wrote report to ${outputPath}`);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
