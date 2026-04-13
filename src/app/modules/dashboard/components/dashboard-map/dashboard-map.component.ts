import { animate, style, transition, trigger } from '@angular/animations';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  SENSOR_THRESHOLD_COLORS,
  SENSOR_THRESHOLDS_BY_SERIES_ID,
  SensorThresholdConfig,
  SensorThresholdSeverity,
} from '@core/config/sensor-thresholds';
import {
  DATA_POINT_QUALITY_COLOR_CHART,
  DATA_POINT_TYPE_ICON,
  DataPoint,
  DataPointQuality,
  DataPointType,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { LatLong } from '@core/models/location';
import {
  DataPointsApi,
  SensorHistoryPoint,
} from '@core/services/datapoints-api/datapoints-api.service';
import { LocationService, UserLocation } from '@core/services/location.service';
import { ObservationRealtimeService } from '@core/services/observation-realtime.service';
import {
  DashboardMessage,
  ScheduledMessage,
  ScheduledMessagesService,
} from '@core/services/scheduled-messages.service';
import { environment } from '@environments/environment';
import { TranslateService } from '@ngx-translate/core';
import {
  MapBounds,
  MapComponent,
  Marker,
} from '@shared/components/map/map.component';
import { isSameLocation } from '@shared/utils/location-utils';
import { groupBy } from 'lodash-es';
import { MessageService, PrimeTemplate } from 'primeng/api';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  filter,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  Subject,
  switchMap,
  tap,
  take,
  withLatestFrom,
} from 'rxjs';
import { DashboardDataPointDetailComponent } from '../dashboard-data-point-detail/dashboard-data-point-detail.component';
import { DashboardMessageBannerComponent } from '../dashboard-message-banner/dashboard-message-banner.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { AsyncPipe, DatePipe } from '@angular/common';
import { Toast } from 'primeng/toast';

interface ObservationFeedItem {
  id: string;
  name: string;
  location: LatLong;
  type: DataPointType;
  typeLabel: string;
  lastUpdatedOn?: Date;
  imageUrl?: string;
}

type ObservationTimespanKey = '6m' | '1y' | '3y' | '5y';
type MapDisplayMode = 'default' | 'heatmap';
type TimelineSelectionRangeKey = '7d' | '14d' | '30d' | '60d' | '90d';
type MobileBottomPanel = 'list' | 'timeline' | null;

interface ObservationTimespanOption {
  key: ObservationTimespanKey;
  label: string;
  days: number;
}

interface TimelineSelectionRangeOption {
  key: TimelineSelectionRangeKey;
  label: string;
  days: number;
}

interface ObservationTimespanBounds {
  startMs: number;
  endMs: number;
  durationMs: number;
}

interface ObservationTimelinePoint {
  x: number;
  y: number;
  count: number;
  markerPath: string;
}

interface ObservationTimelineSeries {
  type: DataPointType;
  label: string;
  color: string;
  total: number;
  path: string;
  points: ObservationTimelinePoint[];
}

interface ObservationTimelineTick {
  y: number;
  label: number;
}

interface ObservationTimeline {
  series: ObservationTimelineSeries[];
  ticks: ObservationTimelineTick[];
  startLabel: string;
  endLabel: string;
}

interface ObservationTimelineWindow {
  startMs: number;
  endMs: number;
  startRatio: number;
  widthRatio: number;
}

interface ObservationTimelineWindowStyle {
  leftPercent: number;
  widthPercent: number;
}

interface SensorValueTimelinePoint {
  x: number;
  y: number;
  markerPath: string;
  timestamp: Date;
  value: number;
  color: string;
  severity: SensorThresholdSeverity;
}

interface SensorValueTimeline {
  segments: Array<{
    path: string;
    color: string;
  }>;
  points: SensorValueTimelinePoint[];
  thresholdLines: Array<{
    id: string;
    y: number;
    value: number;
    color: string;
    label: string;
  }>;
  minValue: number;
  maxValue: number;
  startLabel: string;
  endLabel: string;
  unitLabel: string;
}

interface SensorTimelineCursor {
  x: number;
  y: number;
  timestamp: Date;
  value: number;
  color: string;
  severity: SensorThresholdSeverity;
}

interface SensorHistoryCacheEntry {
  cacheKey: string;
  seriesId: number;
  startMs: number;
  endMs: number;
  historyPoints: SensorHistoryPoint[];
}

const OBSERVATION_TIMELINE_COLOR: Record<DataPointType, string> = {
  [DataPointType.WEATHER_CONDITIONS]: '#0284c7',
  [DataPointType.AIR_QUALITY]: '#ea580c',
  [DataPointType.STORM_WATER]: '#15803d',
  [DataPointType.PARKING]: '#4f46e5',
  [DataPointType.ROAD_WORKS]: '#b45309',
  [DataPointType.WATERBAG_TESTKIT]: '#0f766e',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const INTOTO_SENSOR_MARKER_ICON = 'sensor-water-level-icon.svg';

@Component({
  selector: 'app-dashboard-map',
  templateUrl: './dashboard-map.component.html',
  styleUrls: ['./dashboard-map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideInAndOut', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('180ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        style({ opacity: 1 }),
        animate('120ms ease-in', style({ opacity: 0 })),
      ]),
    ]),
  ],
  standalone: true,
  imports: [
    MapComponent,
    DashboardDataPointDetailComponent,
    DashboardMessageBannerComponent,
    IconComponent,
    AsyncPipe,
    DatePipe,
    Toast,
    PrimeTemplate,
  ],
})
export class DashboardMapComponent implements AfterViewInit {
  public readonly DATA_POINT_TYPE = DataPointType;
  private _allDataPoints = signal<DataPoint[]>([]);
  private readonly timelinePaddingTop = 7;
  private readonly timelinePaddingBottom = 8;
  private readonly timelinePaddingHorizontal = 2;
  private timelineWindowStartRatio = signal<number>(1);
  private timelineWindowDragOffsetRatio = 0;
  private sensorCursorRatio = signal<number>(1);
  private sensorViewStartDate = signal<string | null>(null);
  private sensorViewEndDate = signal<string | null>(null);
  private sensorViewFullPeriod = signal<boolean>(false);
  public showTypeFilterDropdown = signal<boolean>(false);
  public showDisplayModeDropdown = signal<boolean>(false);
  public showSelectionRangeDropdown = signal<boolean>(false);
  public showFullPeriodDropdown = signal<boolean>(false);
  public showMobileControlsCard = signal<boolean>(false);
  public activeMobileBottomPanel = signal<MobileBottomPanel>(null);
  public selectedDisplayMode = signal<MapDisplayMode>('default');
  public showObservationTimespanFilter = signal<boolean>(false);
  public selectedObservationTimespan = signal<ObservationTimespanKey>('1y');
  public readonly observationTimespanOptions: ObservationTimespanOption[] = [
    { key: '6m', label: '6 months', days: 183 },
    { key: '1y', label: '1 year', days: 365 },
    { key: '3y', label: '3 years', days: 365 * 3 },
    { key: '5y', label: '5 years', days: 365 * 5 },
  ];
  public selectedObservationTimespanLabel = computed(() => {
    const selectedKey = this.selectedObservationTimespan();
    return (
      this.observationTimespanOptions.find(
        (option) => option.key === selectedKey,
      )?.label ?? '1 year'
    );
  });
  private observationTimespanBounds = computed<ObservationTimespanBounds>(
    () => {
      const now = new Date();
      const endMs = this.getDayEnd(now).getTime();
      const selectedKey = this.selectedObservationTimespan();
      const selectedOption = this.observationTimespanOptions.find(
        (option) => option.key === selectedKey,
      );

      const durationDays = selectedOption?.days ?? 365;
      const start = new Date(now);
      start.setDate(now.getDate() - (durationDays - 1));
      const startMs = this.getDayStart(start).getTime();
      return {
        startMs,
        endMs,
        durationMs: Math.max(DAY_MS, endMs - startMs),
      };
    },
  );
  public observationTimelineWindow = computed<ObservationTimelineWindow>(() => {
    const bounds = this.observationTimespanBounds();
    const selectionDurationMs = Math.min(
      this.selectedSelectionRangeDays() * DAY_MS,
      bounds.durationMs,
    );
    const maxStartRatio =
      bounds.durationMs <= selectionDurationMs
        ? 0
        : (bounds.durationMs - selectionDurationMs) / bounds.durationMs;
    const startRatio = Math.min(
      Math.max(this.timelineWindowStartRatio(), 0),
      maxStartRatio,
    );
    const startMs = bounds.startMs + startRatio * bounds.durationMs;
    const endMs = startMs + selectionDurationMs;

    return {
      startMs,
      endMs,
      startRatio,
      widthRatio: selectionDurationMs / bounds.durationMs,
    };
  });
  public observationTimelineWindowStyle =
    computed<ObservationTimelineWindowStyle>(() => ({
      leftPercent: this.observationTimelineWindow().startRatio * 100,
      widthPercent: this.observationTimelineWindow().widthRatio * 100,
    }));
  public selectedTimelineWindowLabel = computed(() => {
    const window = this.observationTimelineWindow();
    return `${new Date(window.startMs).toLocaleDateString()} - ${new Date(
      window.endMs,
    ).toLocaleDateString()}`;
  });
  public readonly typeFilterOptions: DataPointType[] = [
    DataPointType.WEATHER_CONDITIONS,
    DataPointType.AIR_QUALITY,
    DataPointType.STORM_WATER,
    DataPointType.PARKING,
    DataPointType.ROAD_WORKS,
    DataPointType.WATERBAG_TESTKIT,
  ];
  public dataPointTypeFilter = signal<DataPointType[]>([]);
  public hasActiveTypeFilter = computed(
    () => this.dataPointTypeFilter().length > 0,
  );
  public readonly displayModeOptions: Array<{
    key: MapDisplayMode;
    label: string;
  }> = [
    { key: 'default', label: 'Default' },
    { key: 'heatmap', label: 'Heatmap' },
  ];
  public readonly selectionRangeOptions: TimelineSelectionRangeOption[] = [
    { key: '7d', label: '7 days', days: 7 },
    { key: '14d', label: '14 days', days: 14 },
    { key: '30d', label: '30 days', days: 30 },
    { key: '60d', label: '60 days', days: 60 },
    { key: '90d', label: '90 days', days: 90 },
  ];
  public selectedSelectionRange = signal<TimelineSelectionRangeKey>('30d');
  private selectedSelectionRangeDays = computed(() => {
    const selectedKey = this.selectedSelectionRange();
    return (
      this.selectionRangeOptions.find((option) => option.key === selectedKey)
        ?.days ?? 30
    );
  });
  public selectedSelectionRangeLabel = computed(() => {
    const selectedKey = this.selectedSelectionRange();
    return (
      this.selectionRangeOptions.find((option) => option.key === selectedKey)
        ?.label ?? '30 days'
    );
  });
  public selectedDisplayModeLabel = computed(
    () =>
      this.displayModeOptions.find(
        (option) => option.key === this.selectedDisplayMode(),
      )?.label ?? 'Default',
  );
  public selectedTypeFilterLabel = computed(() => {
    const selected = this.dataPointTypeFilter();
    if (selected.length === 0) {
      return 'All types';
    }
    if (selected.length === 1) {
      return this.getObservationTypeLabel(selected[0]);
    }
    return `${selected.length} selected`;
  });
  private visibleMapBounds = signal<MapBounds | null>(null);
  private _filteredDataPoints$: Observable<DataPoint[]> = combineLatest([
    toObservable(this._allDataPoints),
    toObservable(this.dataPointTypeFilter),
    toObservable(this.observationTimelineWindow),
    toObservable(this.visibleMapBounds),
  ]).pipe(
    map(([allDataPoints, dataPointFilter, selectedWindow, bounds]) => {
      const timeFilteredDataPoints = allDataPoints.filter(
        (point) =>
          this.isPointWithinBounds(point.location, bounds) &&
          this.isTimestampWithinRange(
            point.lastUpdatedOn,
            selectedWindow.startMs,
            selectedWindow.endMs,
          ),
      );

      return dataPointFilter.length > 0
        ? timeFilteredDataPoints.filter((point) =>
            dataPointFilter.includes(point.type),
          )
        : timeFilteredDataPoints;
    }),
  );

  private _activeLocation = signal<LatLong | undefined>(undefined);
  public activeScheduledMessages = signal<ScheduledMessage[]>([]);
  private sensorHistoryCache = signal<Record<string, SensorHistoryCacheEntry>>(
    {},
  );
  private sensorHistoryRequests = new Map<
    string,
    Observable<SensorHistoryPoint[]>
  >();
  private dismissedScheduledMessageIds = signal<Set<string>>(new Set());
  public sensorWarningMessages = computed<DashboardMessage[]>(() => {
    const bounds = this.observationTimespanBounds();
    const cache = this.sensorHistoryCache();

    return this.getIntotoStormWaterPoints(this._allDataPoints())
      .filter((point) =>
        this.isPointWithinBounds(point.location, this.visibleMapBounds()),
      )
      .map((point) => {
        const seriesId = point.historySeries?.seriesId;
        if (seriesId === undefined) {
          return null;
        }

        const cacheEntry = cache[this.getSensorHistoryCacheKey(seriesId, bounds)];
        if (!cacheEntry) {
          return null;
        }

        return this.buildSensorWarningMessage(point, cacheEntry.historyPoints);
      })
      .filter((message): message is DashboardMessage => message !== null);
  });
  public visibleScheduledMessages = computed(() =>
    [...this.activeScheduledMessages(), ...this.sensorWarningMessages()]
      .filter((message) => !this.dismissedScheduledMessageIds().has(message.id))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === 'warning' ? -1 : 1;
        }

        return (right.start ?? '').localeCompare(left.start ?? '');
      }),
  );
  private selectedDataPointsBase = computed(() => {
    const latLong = this._activeLocation();
    const selectedWindow = this.observationTimelineWindow();
    const activeTypeFilter = this.dataPointTypeFilter();
    const bounds = this.visibleMapBounds();

    if (latLong) {
      return this._allDataPoints().filter(
        (point) =>
          isSameLocation(point.location, latLong) &&
          this.isPointWithinBounds(point.location, bounds) &&
          this.isTimestampWithinRange(
            point.lastUpdatedOn,
            selectedWindow.startMs,
            selectedWindow.endMs,
          ) &&
          this.matchesTypeFilter(point.type, activeTypeFilter),
      );
    }

    return null;
  });
  private selectedSensorHistoryPoints = signal<SensorHistoryPoint[]>([]);
  public selectedSensorHistoryLoading = signal<boolean>(false);
  public selectedSensorPoint = computed<WeatherStormWaterDataPoint | null>(
    () => {
      const selected = this.selectedDataPointsBase();
      if (!selected) {
        return null;
      }

      const point = selected.find(
        (item): item is WeatherStormWaterDataPoint =>
          item.type === DataPointType.STORM_WATER &&
          !!item.historySeries &&
          item.historySeries.provider === 'intoto',
      );

      return point ?? null;
    },
  );
  public selectedSensorViewBounds = computed<ObservationTimespanBounds>(() => {
    const fullBounds = this.observationTimespanBounds();
    const fullStart = new Date(fullBounds.startMs);
    const fullEnd = new Date(fullBounds.endMs);
    const defaultStart = this.getDefaultSensorViewStartDate(fullEnd);
    const parsedStart = this.parseDateInput(this.sensorViewStartDate());
    const parsedEnd = this.parseDateInput(this.sensorViewEndDate());
    const startDate = this.sensorViewFullPeriod()
      ? fullStart
      : (parsedStart ?? defaultStart);
    const endDate = parsedEnd ?? fullEnd;
    let startMs = Math.max(
      this.getDayStart(startDate).getTime(),
      fullBounds.startMs,
    );
    let endMs = Math.min(this.getDayEnd(endDate).getTime(), fullBounds.endMs);

    if (startMs > endMs) {
      startMs = endMs;
    }

    return {
      startMs,
      endMs,
      durationMs: Math.max(DAY_MS, endMs - startMs),
    };
  });
  public selectedSensorViewStartInput = computed(() =>
    this.formatDateForInput(new Date(this.selectedSensorViewBounds().startMs)),
  );
  public selectedSensorViewEndInput = computed(() =>
    this.formatDateForInput(new Date(this.selectedSensorViewBounds().endMs)),
  );
  public selectedSensorThresholdConfig = computed<SensorThresholdConfig | null>(
    () => {
      const seriesId = this.selectedSensorPoint()?.historySeries?.seriesId;
      return seriesId
        ? (SENSOR_THRESHOLDS_BY_SERIES_ID[seriesId] ?? null)
        : null;
    },
  );
  public selectedSensorTimeline = computed<SensorValueTimeline | null>(() => {
    const point = this.selectedSensorPoint();
    const historyPoints = this.selectedSensorHistoryPoints();
    if (!point || historyPoints.length === 0) {
      return null;
    }

    return this.buildSensorValueTimeline(
      historyPoints,
      point.historySeries?.unitLabel ?? '',
      this.selectedSensorViewBounds(),
      this.selectedSensorThresholdConfig(),
    );
  });
  public selectedSensorCursor = computed<SensorTimelineCursor | null>(() => {
    const sensorTimeline = this.selectedSensorTimeline();
    if (!sensorTimeline || sensorTimeline.points.length === 0) {
      return null;
    }

    const bounds = this.selectedSensorViewBounds();
    const targetTimestamp =
      bounds.startMs + this.sensorCursorRatio() * bounds.durationMs;

    return sensorTimeline.points.reduce((closest, point) =>
      Math.abs(point.timestamp.getTime() - targetTimestamp) <
      Math.abs(closest.timestamp.getTime() - targetTimestamp)
        ? point
        : closest,
    );
  });
  private selectedSensorDisplayPoint =
    computed<WeatherStormWaterDataPoint | null>(() => {
      const sensorPoint = this.selectedSensorPoint();
      const sensorCursor = this.selectedSensorCursor();

      if (!sensorPoint || !sensorCursor) {
        return null;
      }

      return {
        ...sensorPoint,
        lastUpdatedOn: sensorCursor.timestamp,
        data: {
          ...sensorPoint.data,
          waterLevel: Math.round(sensorCursor.value * 1000) / 1000,
        },
      };
    });
  public selectedDataPoints = computed(() => {
    const selected = this.selectedDataPointsBase();
    const selectedSensorPoint = this.selectedSensorPoint();
    const selectedSensorDisplayPoint = this.selectedSensorDisplayPoint();

    if (!selected) {
      return null;
    }

    if (!selectedSensorPoint || !selectedSensorDisplayPoint) {
      return selected;
    }

    return selected.map((point) =>
      point === selectedSensorPoint ? selectedSensorDisplayPoint : point,
    );
  });
  public selectedTimelineHeaderLabel = computed(() => {
    if (this.selectedSensorPoint()) {
      const bounds = this.selectedSensorViewBounds();
      return `View · ${new Date(bounds.startMs).toLocaleDateString()} - ${new Date(
        bounds.endMs,
      ).toLocaleDateString()}`;
    }

    return `${this.selectedObservationTimespanLabel()} · ${this.selectedTimelineWindowLabel()}`;
  });
  private _observationFeed = computed<ObservationFeedItem[]>(() =>
    this._allDataPoints()
      .filter((point) =>
        this.isPointWithinBounds(point.location, this.visibleMapBounds()),
      )
      .slice()
      .sort(
        (a, b) =>
          (b.lastUpdatedOn?.getTime() ?? 0) - (a.lastUpdatedOn?.getTime() ?? 0),
      )
      .map((point, index) => ({
        id: `${point.type}-${point.name}-${point.location.join(',')}-${point.lastUpdatedOn?.getTime() ?? index}`,
        name: point.name,
        location: point.location,
        type: point.type,
        typeLabel: this.getObservationFeedTypeLabel(point),
        lastUpdatedOn: point.lastUpdatedOn,
        imageUrl: this.getObservationImageUrl(point),
      })),
  );
  public observationFeed = computed<ObservationFeedItem[]>(() => {
    const selectedWindow = this.observationTimelineWindow();
    const activeTypeFilter = this.dataPointTypeFilter();

    return this._observationFeed().filter(
      (item) =>
        this.isTimestampWithinRange(
          item.lastUpdatedOn,
          selectedWindow.startMs,
          selectedWindow.endMs,
        ) && this.matchesTypeFilter(item.type, activeTypeFilter),
    );
  });
  public observationTimeline = computed<ObservationTimeline>(() => {
    const bounds = this.observationTimespanBounds();
    const observations = this._observationFeed()
      .filter((item) =>
        this.isTimestampWithinRange(
          item.lastUpdatedOn,
          bounds.startMs,
          bounds.endMs,
        ),
      )
      .filter((item) =>
        this.matchesTypeFilter(item.type, this.dataPointTypeFilter()),
      )
      .filter((item) => item.lastUpdatedOn) as Array<
      ObservationFeedItem & { lastUpdatedOn: Date }
    >;

    const start = this.getDayStart(new Date(bounds.startMs));
    const end = this.getDayStart(new Date(bounds.endMs));
    const totalDays = Math.max(
      1,
      Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1,
    );
    const bucketSizeDays = totalDays > 540 ? 30 : totalDays > 180 ? 7 : 1;
    const bucketCount = Math.max(1, Math.ceil(totalDays / bucketSizeDays));

    const leftX = this.timelinePaddingHorizontal;
    const rightX = 100 - this.timelinePaddingHorizontal;
    const topY = this.timelinePaddingTop;
    const bottomY = 100 - this.timelinePaddingBottom;
    const plotWidth = rightX - leftX;
    const plotHeight = bottomY - topY;

    const seriesMap = new Map<DataPointType, number[]>();
    observations.forEach((item) => {
      const elapsedDays = Math.floor(
        (this.getDayStart(item.lastUpdatedOn).getTime() - start.getTime()) /
          DAY_MS,
      );
      const bucketIndex = Math.max(
        0,
        Math.min(bucketCount - 1, Math.floor(elapsedDays / bucketSizeDays)),
      );

      if (!seriesMap.has(item.type)) {
        seriesMap.set(item.type, new Array(bucketCount).fill(0));
      }

      const buckets = seriesMap.get(item.type);
      if (buckets) {
        buckets[bucketIndex] += 1;
      }
    });

    const maxCount = Math.max(
      1,
      ...Array.from(seriesMap.values()).flatMap((counts) => counts),
    );

    const series = Array.from(seriesMap.entries())
      .map(([type, counts]) => {
        const points = counts.map((count, index) => {
          const progress = bucketCount > 1 ? index / (bucketCount - 1) : 0.5;
          const x = leftX + progress * plotWidth;
          const y = bottomY - (count / maxCount) * plotHeight;

          return {
            x,
            y,
            count,
            markerPath: `M ${x.toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`,
          };
        });

        return {
          type,
          label: this.getObservationTypeLabel(type),
          color: OBSERVATION_TIMELINE_COLOR[type],
          total: counts.reduce((sum, value) => sum + value, 0),
          path: points
            .map(
              (point, index) =>
                `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
            )
            .join(' '),
          points,
        };
      })
      .sort((a, b) => b.total - a.total);

    const ticks: ObservationTimelineTick[] = [0, 0.25, 0.5, 0.75, 1].map(
      (ratio) => ({
        y: bottomY - ratio * plotHeight,
        label: Math.round(maxCount * ratio),
      }),
    );

    return {
      series,
      ticks,
      startLabel: start.toLocaleDateString(),
      endLabel: end.toLocaleDateString(),
    };
  });

  public dataPointMarkers$: Observable<Marker[]> = combineLatest([
    this._filteredDataPoints$,
    toObservable(this._activeLocation),
    toObservable(this.selectedDisplayMode),
  ]).pipe(
    map(([points, activeLocation, displayMode]) =>
      displayMode === 'heatmap'
        ? this.createHeatmapMarkers(points)
        : this.createMarkersFromDataPoints(points, activeLocation),
    ),
  );

  private _weatherConditionDataPointMarkersLoadingSubject$ =
    new BehaviorSubject(true);
  private _weatherStormWaterDataPointMarkersLoadingSubject$ =
    new BehaviorSubject(true);
  private _weatherAirQualityDataPointMarkersLoadingSubject$ =
    new BehaviorSubject(true);
  private _parkingDataPointMarkersLoadingSubject$ = new BehaviorSubject(true);
  private _waterbagTestkitDataPointMarkersLoadingSubject$ = new BehaviorSubject(
    true,
  );
  private _roadWorksDataPointMarkersLoadingSubject$ = new BehaviorSubject(true);

  public locationLoading$: Observable<boolean> | undefined;
  public locationPermissionState$: Observable<PermissionState> | undefined;

  public readonly TOAST_KEY = 'loading';

  private _mapCenterSubject$ = new BehaviorSubject<LatLong>(
    environment.defaultLocation as LatLong,
  );
  public mapCenter$ = this._mapCenterSubject$.asObservable();
  private currentMapCenter: LatLong = environment.defaultLocation as LatLong;

  private _focusLocation$ = new Subject<void>();
  private lastObservationRefreshCenter?: LatLong;

  private readonly destroyRef = inject(DestroyRef);
  private readonly debugIntoto = !environment.production;

  public constructor(
    private readonly locationService: LocationService,
    private readonly dataPointsApi: DataPointsApi,
    private readonly observationRealtimeService: ObservationRealtimeService,
    private readonly scheduledMessagesService: ScheduledMessagesService,
    private readonly messageService: MessageService,
    private readonly translateService: TranslateService,
  ) {
    combineLatest([
      this._weatherConditionDataPointMarkersLoadingSubject$,
      this._weatherStormWaterDataPointMarkersLoadingSubject$,
      this._weatherAirQualityDataPointMarkersLoadingSubject$,
      this._parkingDataPointMarkersLoadingSubject$,
      this._waterbagTestkitDataPointMarkersLoadingSubject$,
      this._roadWorksDataPointMarkersLoadingSubject$,
    ])
      .pipe(takeUntilDestroyed())
      .subscribe(
        (loadingStates) =>
          loadingStates.every((loading) => !loading) &&
          this.closeLoadingDataToast(),
      );

    this.dataPointsApi
      .getWeatherConditions()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((points) =>
        this.handleDataPointsByType(points, DataPointType.WEATHER_CONDITIONS),
      );

    this.dataPointsApi
      .getWeatherAirQuality()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((points) =>
        this.handleDataPointsByType(points, DataPointType.AIR_QUALITY),
      );

    this.dataPointsApi
      .getParking()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((points) =>
        this.handleDataPointsByType(points, DataPointType.PARKING),
      );

    this.refreshObservationDataPoints(this._mapCenterSubject$.value);

    this.dataPointsApi
      .getRoadWorks()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((points) =>
        this.handleDataPointsByType(points, DataPointType.ROAD_WORKS),
      );

    this.observationRealtimeService.observationChanges$
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.refreshObservationDataPoints(this._mapCenterSubject$.value, true),
      );

    this.scheduledMessagesService
      .getActiveMessages()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((messages) => this.activeScheduledMessages.set(messages));

    combineLatest([
      toObservable(this._allDataPoints),
      toObservable(this.observationTimespanBounds),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([points, bounds]) =>
        this.prefetchSensorHistories(
          this.getIntotoStormWaterPoints(points),
          bounds,
        ),
      );

    combineLatest([
      toObservable(this.selectedSensorPoint),
      toObservable(this.selectedSensorViewBounds),
    ])
      .pipe(
        switchMap(([point, bounds]) => {
          this.sensorCursorRatio.set(1);

          if (!point) {
            this.selectedSensorHistoryLoading.set(false);
            return of([] as SensorHistoryPoint[]);
          }

          this.selectedSensorHistoryLoading.set(true);
          return this.loadSensorHistory(point, bounds);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((historyPoints) => {
        this.selectedSensorHistoryPoints.set(historyPoints);
        this.selectedSensorHistoryLoading.set(false);
      });

    this._focusLocation$
      .pipe(take(1), takeUntilDestroyed())
      .subscribe(this.onInitialFocusLocation.bind(this));
  }

  public ngAfterViewInit(): void {
    this.showLoadingDataToast();
  }

  public onMarkerClick(latLong: LatLong): void {
    this.currentMapCenter = latLong;
    this._mapCenterSubject$.next(latLong);
    this.resetSensorViewRange();
    this.setActiveMarker(latLong);
  }

  public onDataPointClose(): void {
    this.resetSensorViewRange();
    this.setActiveMarker();
  }

  public onMapCenterChange(latLong: LatLong): void {
    this.currentMapCenter = latLong;
    this.refreshObservationDataPoints(latLong, true);
  }

  public onMapBoundsChange(bounds: MapBounds): void {
    this.visibleMapBounds.set(bounds);
  }

  public toggleTypeFilterDropdown(): void {
    this.showTypeFilterDropdown.update((open) => !open);
    this.showDisplayModeDropdown.set(false);
    this.showSelectionRangeDropdown.set(false);
    this.showFullPeriodDropdown.set(false);
  }

  public toggleDisplayModeDropdown(): void {
    this.showDisplayModeDropdown.update((open) => !open);
    this.showTypeFilterDropdown.set(false);
    this.showSelectionRangeDropdown.set(false);
    this.showFullPeriodDropdown.set(false);
  }

  public toggleSelectionRangeDropdown(): void {
    this.showSelectionRangeDropdown.update((open) => !open);
    this.showTypeFilterDropdown.set(false);
    this.showDisplayModeDropdown.set(false);
    this.showFullPeriodDropdown.set(false);
  }

  public toggleFullPeriodDropdown(): void {
    this.showFullPeriodDropdown.update((open) => !open);
    this.showTypeFilterDropdown.set(false);
    this.showDisplayModeDropdown.set(false);
    this.showSelectionRangeDropdown.set(false);
  }

  public toggleMobileControlsCard(): void {
    this.showMobileControlsCard.update((open) => !open);
    if (!this.showMobileControlsCard()) {
      this.showTypeFilterDropdown.set(false);
      this.showDisplayModeDropdown.set(false);
      this.showSelectionRangeDropdown.set(false);
      this.showFullPeriodDropdown.set(false);
    }
  }

  public onFilterToggle(type: DataPointType): void {
    this.dataPointTypeFilter.update((current) => {
      const update = [...current];

      if (!update.includes(type)) {
        update.push(type);
      } else {
        update.splice(update.indexOf(type), 1);
      }

      return update;
    });
  }

  public clearTypeFilter(): void {
    this.dataPointTypeFilter.set([]);
  }

  public setDisplayMode(mode: MapDisplayMode): void {
    this.selectedDisplayMode.set(mode);
    this.showDisplayModeDropdown.set(false);
  }

  public setSelectionRange(range: TimelineSelectionRangeKey): void {
    this.selectedSelectionRange.set(range);
    this.showSelectionRangeDropdown.set(false);
    this.setTimelineWindowStartRatio(this.timelineWindowStartRatio());
  }

  public setMobileBottomPanel(panel: MobileBottomPanel): void {
    this.activeMobileBottomPanel.set(panel);
    this.showObservationTimespanFilter.set(false);
  }

  public onFocusLocationClick(): void {
    this.locationService.refreshUserLocation();
    this._focusLocation$.next();
  }

  public onDismissScheduledMessage(messageId: string): void {
    this.dismissedScheduledMessageIds.update((current) => {
      const next = new Set(current);
      next.add(messageId);
      return next;
    });
  }

  public onObservationClick(location: LatLong): void {
    this.currentMapCenter = location;
    this._mapCenterSubject$.next(location);
    this.resetSensorViewRange();
    void this.setActiveMarker(location);
  }

  public toggleObservationTimespanFilter(): void {
    this.showObservationTimespanFilter.update((value) => !value);
  }

  public setObservationTimespan(key: ObservationTimespanKey): void {
    this.selectedObservationTimespan.set(key);
    this.timelineWindowStartRatio.set(1);
    this.resetSensorViewRange();
    this.showObservationTimespanFilter.set(false);
    this.showFullPeriodDropdown.set(false);
  }

  public onSensorViewStartDateChange(value: string): void {
    const normalized = this.normalizeDateInput(value);
    if (!normalized) {
      this.sensorViewStartDate.set(null);
      return;
    }

    this.sensorViewFullPeriod.set(false);
    const currentEnd = this.selectedSensorViewEndInput();
    this.sensorViewStartDate.set(normalized);
    if (normalized > currentEnd) {
      this.sensorViewEndDate.set(normalized);
    }
  }

  public onSensorViewEndDateChange(value: string): void {
    const normalized = this.normalizeDateInput(value);
    if (!normalized) {
      this.sensorViewEndDate.set(null);
      return;
    }

    this.sensorViewFullPeriod.set(false);
    const currentStart = this.selectedSensorViewStartInput();
    this.sensorViewEndDate.set(normalized);
    if (normalized < currentStart) {
      this.sensorViewStartDate.set(normalized);
    }
  }

  public resetSensorViewRange(): void {
    this.sensorViewStartDate.set(null);
    this.sensorViewEndDate.set(null);
    this.sensorViewFullPeriod.set(false);
  }

  public showFullSensorViewRange(): void {
    this.sensorViewStartDate.set(null);
    this.sensorViewEndDate.set(null);
    this.sensorViewFullPeriod.set(true);
  }

  public onTimelineWindowPointerDown(
    event: PointerEvent,
    container: HTMLElement,
  ): void {
    const target = event.currentTarget as HTMLElement | null;
    target?.setPointerCapture(event.pointerId);

    const pointerRatio = this.getPointerRatio(event, container);
    this.timelineWindowDragOffsetRatio =
      pointerRatio - this.observationTimelineWindow().startRatio;
    event.preventDefault();
  }

  public onTimelineWindowPointerMove(
    event: PointerEvent,
    container: HTMLElement,
  ): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target?.hasPointerCapture(event.pointerId)) {
      return;
    }

    const pointerRatio = this.getPointerRatio(event, container);
    this.setTimelineWindowStartRatio(
      pointerRatio - this.timelineWindowDragOffsetRatio,
    );
    event.preventDefault();
  }

  public onTimelineWindowPointerUp(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  public onSensorCursorPointerDown(
    event: PointerEvent,
    container: HTMLElement,
  ): void {
    const target = event.currentTarget as HTMLElement | null;
    target?.setPointerCapture(event.pointerId);
    this.setSensorCursorRatio(this.getPointerRatio(event, container));
    event.preventDefault();
  }

  public onSensorCursorPointerMove(
    event: PointerEvent,
    container: HTMLElement,
  ): void {
    const target = event.currentTarget as HTMLElement | null;
    if (!target?.hasPointerCapture(event.pointerId)) {
      return;
    }

    this.setSensorCursorRatio(this.getPointerRatio(event, container));
    event.preventDefault();
  }

  public onSensorCursorPointerUp(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  public getObservationTypeLabel(type: DataPointType): string {
    switch (type) {
      case DataPointType.WEATHER_CONDITIONS:
        return 'Weather conditions';
      case DataPointType.AIR_QUALITY:
        return 'Air quality';
      case DataPointType.STORM_WATER:
        return 'Storm water';
      case DataPointType.PARKING:
        return 'Parking';
      case DataPointType.ROAD_WORKS:
        return 'Road works';
      case DataPointType.WATERBAG_TESTKIT:
        return 'Water observations';
      default:
        return 'Observation';
    }
  }

  public getObservationFeedTypeLabel(point: DataPoint): string {
    if (
      point.type === DataPointType.STORM_WATER &&
      point.historySeries?.provider === 'intoto'
    ) {
      return 'Sensor reading';
    }

    return this.getObservationTypeLabel(point.type);
  }

  public getObservationTypeColor(type: DataPointType): string {
    return OBSERVATION_TIMELINE_COLOR[type];
  }

  public isTypeFilterActive(type: DataPointType): boolean {
    return this.dataPointTypeFilter().includes(type);
  }

  private getObservationImageUrl(point: DataPoint): string | undefined {
    if (point.type !== DataPointType.WATERBAG_TESTKIT || !point.imageUrl) {
      return undefined;
    }

    return this.normalizeImageUrl(point.imageUrl);
  }

  private normalizeImageUrl(imageUrl: string): string {
    let normalized = imageUrl.trim();
    const pocketbaseBase = environment.pocketbaseUrl.replace(/\/$/, '');

    if (normalized.startsWith('../')) {
      normalized = normalized.replace(/^(\.\.\/)+/, '');
    }

    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }

    if (normalized.startsWith('/api/')) {
      return normalized;
    }

    if (normalized.startsWith('api/')) {
      return `/${normalized.replace(/^\/+/, '')}`;
    }

    if (normalized.startsWith('/files/')) {
      return `${pocketbaseBase}/${normalized.replace(/^\/+/, '')}`;
    }

    if (normalized.startsWith('files/')) {
      return `${pocketbaseBase}/${normalized}`;
    }

    if (normalized.startsWith('/')) {
      return normalized;
    }

    return `${environment.streetAiUploadUrl.replace(/\/$/, '')}/${normalized.replace(/^\/+/, '')}`;
  }

  private normalizeDateInput(value: string): string | null {
    const parsed = this.parseDateInput(value);
    if (!parsed) {
      return null;
    }

    const bounds = this.observationTimespanBounds();
    const clamped = Math.min(
      Math.max(this.getDayStart(parsed).getTime(), bounds.startMs),
      bounds.endMs,
    );
    return this.formatDateForInput(new Date(clamped));
  }

  private parseDateInput(value: string | null): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatDateForInput(value: Date): string {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDefaultSensorViewStartDate(fullEnd: Date): Date {
    const defaultStart = this.getDayStart(new Date(fullEnd));
    defaultStart.setMonth(defaultStart.getMonth() - 3);
    defaultStart.setDate(defaultStart.getDate() + 1);
    return defaultStart;
  }

  private isTimestampWithinRange(
    timestamp: Date | undefined,
    startMs: number,
    endMs: number,
  ): boolean {
    if (!timestamp) {
      return true;
    }
    const value = timestamp.getTime();
    return value >= startMs && value <= endMs;
  }

  private matchesTypeFilter(
    type: DataPointType,
    typeFilter: DataPointType[],
  ): boolean {
    return typeFilter.length === 0 || typeFilter.includes(type);
  }

  private getPointerRatio(event: PointerEvent, container: HTMLElement): number {
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) {
      return 0;
    }
    const raw = (event.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(raw, 1));
  }

  private setTimelineWindowStartRatio(rawStartRatio: number): void {
    const bounds = this.observationTimespanBounds();
    const selectionDurationMs = Math.min(
      this.selectedSelectionRangeDays() * DAY_MS,
      bounds.durationMs,
    );
    const maxStartRatio =
      bounds.durationMs <= selectionDurationMs
        ? 0
        : (bounds.durationMs - selectionDurationMs) / bounds.durationMs;
    const clamped = Math.max(0, Math.min(rawStartRatio, maxStartRatio));
    this.timelineWindowStartRatio.set(clamped);
  }

  private setSensorCursorRatio(rawRatio: number): void {
    this.sensorCursorRatio.set(Math.max(0, Math.min(rawRatio, 1)));
  }

  private getDayStart(date: Date): Date {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    return dayStart;
  }

  private getDayEnd(date: Date): Date {
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    return dayEnd;
  }

  private async showLoadingDataToast(): Promise<void> {
    this.messageService.add({
      key: this.TOAST_KEY,
      sticky: true,
      severity: 'custom',
      detail: this.translateService.instant('LOADING_STATES.FETCHING_DATA'),
    });
  }

  private closeLoadingDataToast(): void {
    this.messageService.clear(this.TOAST_KEY);
  }

  public async setActiveMarker(latLong?: LatLong): Promise<void> {
    this._activeLocation.set(latLong);
  }

  private onInitialFocusLocation(): void {
    const userLocation$ = this.locationService.userLocation$;

    this.locationPermissionState$ =
      this.locationService.locationPermissionState$;
    this.locationLoading$ = userLocation$.pipe(map(({ loading }) => loading));

    this._focusLocation$
      .pipe(
        withLatestFrom(
          userLocation$,
          this.locationService.locationPermissionState$,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(([_, userLocation, permissionState]) =>
        this.onFocusLocation(userLocation, permissionState),
      );

    this.locationLoading$
      .pipe(
        filter((loading) => !loading),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this._focusLocation$.next());
  }

  private onFocusLocation(
    userLocation: UserLocation,
    permissionState: PermissionState,
  ): void {
    if (userLocation.location && permissionState === 'granted') {
      this.currentMapCenter = userLocation.location;
      this._mapCenterSubject$.next(userLocation.location);
    }

    if (!userLocation.loading && permissionState === 'denied') {
      alert(this.translateService.instant('PERMISSIONS.LOCATION.DENIED.ALERT'));
    }
  }

  private createMarkersFromDataPoints(
    points: DataPoint[],
    activeLocation?: LatLong,
  ): Marker[] {
    const pointsByLocation = groupBy(points, 'location');

    return Object.entries(pointsByLocation).map(([_, dataPoints]) => {
      const hasMultipleDataPoints = dataPoints.length > 1;

      return {
        location: dataPoints[0].location,
        icon: hasMultipleDataPoints
          ? 'multiple-data-points.svg'
          : this.getMarkerIcon(dataPoints[0]),
        color: hasMultipleDataPoints
          ? DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT]
          : DATA_POINT_QUALITY_COLOR_CHART[dataPoints[0].quality],
        ...(activeLocation &&
          isSameLocation(dataPoints[0].location, activeLocation) && {
            active: true,
          }),
      };
    });
  }

  private getMarkerIcon(point: DataPoint): string {
    if (
      point.type === DataPointType.STORM_WATER &&
      point.historySeries?.provider === 'intoto'
    ) {
      return INTOTO_SENSOR_MARKER_ICON;
    }

    return DATA_POINT_TYPE_ICON[point.type];
  }

  private createHeatmapMarkers(points: DataPoint[]): Marker[] {
    const pointsByLocation = groupBy(points, 'location');
    const locationEntries = Object.entries(pointsByLocation).map(
      ([, dataPoints]) => ({
        location: dataPoints[0].location,
        intensity: dataPoints.length,
      }),
    );
    const maxIntensity = Math.max(
      1,
      ...locationEntries.map((entry) => entry.intensity),
    );

    return locationEntries.map((entry) => {
      const ratio = entry.intensity / maxIntensity;
      return {
        location: entry.location,
        displayMode: 'heatmap',
        heatIntensity: Math.max(0.1, ratio),
      };
    });
  }

  private buildSensorValueTimeline(
    historyPoints: SensorHistoryPoint[],
    unitLabel: string,
    bounds: ObservationTimespanBounds,
    thresholdConfig: SensorThresholdConfig | null,
  ): SensorValueTimeline {
    const sortedPoints = this.bucketSensorHistoryPoints(historyPoints, bounds)
      .slice()
      .sort(
        (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
      );
    const leftX = this.timelinePaddingHorizontal;
    const rightX = 100 - this.timelinePaddingHorizontal;
    const topY = this.timelinePaddingTop;
    const bottomY = 100 - this.timelinePaddingBottom;
    const plotWidth = rightX - leftX;
    const plotHeight = bottomY - topY;
    const thresholdValues = this.getSensorThresholdValues(thresholdConfig);
    const minValue = Math.min(
      ...sortedPoints.map((point) => point.value),
      ...thresholdValues,
    );
    const maxValue = Math.max(
      ...sortedPoints.map((point) => point.value),
      ...thresholdValues,
    );
    const valueRange = Math.max(1e-6, maxValue - minValue);
    const durationMs = Math.max(1, bounds.endMs - bounds.startMs);

    const points = sortedPoints.map((point) => {
      const progress = Math.max(
        0,
        Math.min(1, (point.timestamp.getTime() - bounds.startMs) / durationMs),
      );
      const normalizedValue = (point.value - minValue) / valueRange;
      const x = leftX + progress * plotWidth;
      const y = bottomY - normalizedValue * plotHeight;

      return {
        x,
        y,
        timestamp: point.timestamp,
        value: point.value,
        severity: this.getSensorThresholdSeverity(point.value, thresholdConfig),
        color: this.getSensorThresholdColor(point.value, thresholdConfig),
        markerPath: `M ${x.toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`,
      };
    });

    const segments = this.buildSensorTimelineSegments(points);
    const thresholdLines = this.buildSensorThresholdLines(
      thresholdConfig,
      minValue,
      valueRange,
      topY,
      bottomY,
    );

    return {
      segments,
      points,
      thresholdLines,
      minValue,
      maxValue,
      startLabel: new Date(bounds.startMs).toLocaleDateString(),
      endLabel: new Date(bounds.endMs).toLocaleDateString(),
      unitLabel,
    };
  }

  private buildSensorTimelineSegments(
    points: SensorValueTimelinePoint[],
  ): Array<{ path: string; color: string }> {
    if (points.length < 2) {
      return [];
    }

    const severityRank: Record<SensorThresholdSeverity, number> = {
      green: 0,
      yellow: 1,
      orange: 2,
      red: 3,
    };
    const segments: Array<{ path: string; color: string }> = [];
    let activeSeverity = this.getWorseSensorSeverity(
      points[0].severity,
      points[1].severity,
      severityRank,
    );
    let activePath = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;

    for (let index = 1; index < points.length - 1; index += 1) {
      const nextSeverity = this.getWorseSensorSeverity(
        points[index].severity,
        points[index + 1].severity,
        severityRank,
      );

      if (nextSeverity === activeSeverity) {
        activePath += ` L ${points[index + 1].x.toFixed(2)} ${points[index + 1].y.toFixed(2)}`;
        continue;
      }

      segments.push({
        path: activePath,
        color: SENSOR_THRESHOLD_COLORS[activeSeverity],
      });
      activeSeverity = nextSeverity;
      activePath = `M ${points[index].x.toFixed(2)} ${points[index].y.toFixed(2)} L ${points[index + 1].x.toFixed(2)} ${points[index + 1].y.toFixed(2)}`;
    }

    segments.push({
      path: activePath,
      color: SENSOR_THRESHOLD_COLORS[activeSeverity],
    });

    return segments;
  }

  private buildSensorThresholdLines(
    thresholdConfig: SensorThresholdConfig | null,
    minValue: number,
    valueRange: number,
    topY: number,
    bottomY: number,
  ): Array<{
    id: string;
    y: number;
    value: number;
    color: string;
    label: string;
  }> {
    if (!thresholdConfig) {
      return [];
    }

    const plotHeight = bottomY - topY;

    return thresholdConfig.bands.map((band) => ({
      id: band.id,
      y: bottomY - ((band.value - minValue) / valueRange) * plotHeight,
      value: band.value,
      color: SENSOR_THRESHOLD_COLORS[band.severity],
      label: `${this.capitalizeSensorSeverity(band.severity)} threshold`,
    }));
  }

  private bucketSensorHistoryPoints(
    historyPoints: SensorHistoryPoint[],
    bounds: ObservationTimespanBounds,
  ): SensorHistoryPoint[] {
    if (bounds.durationMs <= 31 * DAY_MS) {
      return historyPoints;
    }

    const maxPointByDay = new Map<string, SensorHistoryPoint>();

    historyPoints.forEach((point) => {
      const bucketKey = this.formatDateForInput(point.timestamp);
      const current = maxPointByDay.get(bucketKey);

      if (
        !current ||
        point.value > current.value ||
        (point.value === current.value &&
          point.timestamp.getTime() > current.timestamp.getTime())
      ) {
        maxPointByDay.set(bucketKey, point);
      }
    });

    return Array.from(maxPointByDay.values());
  }

  private getSensorThresholdValues(
    thresholdConfig: SensorThresholdConfig | null,
  ): number[] {
    if (!thresholdConfig) {
      return [];
    }

    return thresholdConfig.bands.map((band) => band.value);
  }

  private getSensorThresholdSeverity(
    value: number,
    thresholdConfig: SensorThresholdConfig | null,
  ): SensorThresholdSeverity {
    if (!thresholdConfig) {
      return 'green';
    }

    const severityRank: Record<SensorThresholdSeverity, number> = {
      green: 0,
      yellow: 1,
      orange: 2,
      red: 3,
    };

    const severity = thresholdConfig.bands.reduce<SensorThresholdSeverity>(
      (severity, band) => {
        if (value < band.value) {
          return severity;
        }

        return this.getWorseSensorSeverity(
          severity,
          band.severity,
          severityRank,
        );
      },
      'green',
    );

    const highestBand = thresholdConfig.bands.reduce(
      (highest, band) => (band.value > highest.value ? band : highest),
      thresholdConfig.bands[0],
    );

    if (
      highestBand &&
      highestBand.severity !== 'red' &&
      value >= highestBand.value
    ) {
      return 'red';
    }

    return severity;
  }

  private getSensorThresholdColor(
    value: number,
    thresholdConfig: SensorThresholdConfig | null,
  ): string {
    return SENSOR_THRESHOLD_COLORS[
      this.getSensorThresholdSeverity(value, thresholdConfig)
    ];
  }

  private getWorseSensorSeverity(
    left: SensorThresholdSeverity,
    right: SensorThresholdSeverity,
    severityRank: Record<SensorThresholdSeverity, number>,
  ): SensorThresholdSeverity {
    return severityRank[left] >= severityRank[right] ? left : right;
  }

  private capitalizeSensorSeverity(severity: SensorThresholdSeverity): string {
    return `${severity.charAt(0).toUpperCase()}${severity.slice(1)}`;
  }

  private prefetchSensorHistories(
    points: WeatherStormWaterDataPoint[],
    bounds: ObservationTimespanBounds,
  ): void {
    points.forEach((point) => {
      this.loadSensorHistory(point, bounds)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe();
    });
  }

  private loadSensorHistory(
    point: WeatherStormWaterDataPoint,
    bounds: ObservationTimespanBounds,
  ): Observable<SensorHistoryPoint[]> {
    const seriesId = point.historySeries?.seriesId;
    if (seriesId === undefined) {
      return of([]);
    }

    const cacheKey = this.getSensorHistoryCacheKey(seriesId, bounds);
    const cached = this.sensorHistoryCache()[cacheKey];
    if (cached) {
      return of(cached.historyPoints);
    }

    const coveringCacheEntry = Object.values(this.sensorHistoryCache()).find(
      (entry) =>
        entry.seriesId === seriesId &&
        entry.startMs <= bounds.startMs &&
        entry.endMs >= bounds.endMs,
    );
    if (coveringCacheEntry) {
      return of(
        coveringCacheEntry.historyPoints.filter(
          (historyPoint) =>
            historyPoint.timestamp.getTime() >= bounds.startMs &&
            historyPoint.timestamp.getTime() <= bounds.endMs,
        ),
      );
    }

    const inFlight = this.sensorHistoryRequests.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request$ = this.dataPointsApi
      .getStormWaterHistory(
        point,
        new Date(bounds.startMs),
        new Date(bounds.endMs),
      )
      .pipe(
        map((historyPoints) =>
          historyPoints
            .slice()
            .sort(
              (left, right) =>
                left.timestamp.getTime() - right.timestamp.getTime(),
            ),
        ),
        tap((historyPoints) =>
          this.sensorHistoryCache.update((current) => ({
            ...current,
            [cacheKey]: {
              cacheKey,
              seriesId,
              startMs: bounds.startMs,
              endMs: bounds.endMs,
              historyPoints,
            },
          })),
        ),
        finalize(() => {
          this.sensorHistoryRequests.delete(cacheKey);
        }),
        shareReplay(1),
      );

    this.sensorHistoryRequests.set(cacheKey, request$);
    return request$;
  }

  private getIntotoStormWaterPoints(
    points: DataPoint[],
  ): WeatherStormWaterDataPoint[] {
    return points.filter(
      (point): point is WeatherStormWaterDataPoint =>
        point.type === DataPointType.STORM_WATER &&
        point.historySeries?.provider === 'intoto',
    );
  }

  private getSensorHistoryCacheKey(
    seriesId: number,
    bounds: ObservationTimespanBounds,
  ): string {
    return `${seriesId}:${bounds.startMs}:${bounds.endMs}`;
  }

  private buildSensorWarningMessage(
    point: WeatherStormWaterDataPoint,
    historyPoints: SensorHistoryPoint[],
  ): DashboardMessage | null {
    const seriesId = point.historySeries?.seriesId;
    const thresholdConfig =
      seriesId !== undefined
        ? (SENSOR_THRESHOLDS_BY_SERIES_ID[seriesId] ?? null)
        : null;

    if (!thresholdConfig || historyPoints.length === 0) {
      return null;
    }

    const redPoints = historyPoints.filter(
      (historyPoint) =>
        this.getSensorThresholdSeverity(historyPoint.value, thresholdConfig) ===
        'red',
    );

    if (redPoints.length === 0) {
      return null;
    }

    const peakPoint = redPoints.reduce((highest, pointCandidate) =>
      pointCandidate.value > highest.value ||
      (pointCandidate.value === highest.value &&
        pointCandidate.timestamp.getTime() > highest.timestamp.getTime())
        ? pointCandidate
        : highest,
    );
    const highestThreshold = thresholdConfig.bands.reduce(
      (max, band) => Math.max(max, band.value),
      Number.NEGATIVE_INFINITY,
    );
    const measurementUnit =
      point.historySeries?.unitLabel ??
      point.dataUnitOverrides?.['waterLevel'] ??
      '';
    const thresholdUnit = thresholdConfig.unitLabel;
    const warningTimestamp = peakPoint.timestamp.toLocaleString();
    const warningValue = Math.round(peakPoint.value * 1000) / 1000;
    const bounds = this.observationTimespanBounds();

    return {
      id: `sensor-warning-${seriesId}-${bounds.startMs}-${bounds.endMs}`,
      title: `${point.name} crossed the red threshold`,
      content: `<p>Peak reading ${warningValue} ${measurementUnit} at ${warningTimestamp}. This is above the configured red threshold starting at ${highestThreshold} ${thresholdUnit}.</p>`,
      start: peakPoint.timestamp.toISOString(),
      end: peakPoint.timestamp.toISOString(),
      type: 'warning',
    };
  }

  private refreshObservationDataPoints(
    center: LatLong = this.currentMapCenter,
    force = false,
  ): void {
    if (
      !force &&
      this.lastObservationRefreshCenter &&
      isSameLocation(this.lastObservationRefreshCenter, center)
    ) {
      return;
    }

    this.lastObservationRefreshCenter = center;

    if (this.debugIntoto) {
      console.log('[DashboardMap] refreshObservationDataPoints', {
        center,
        force,
        selectedObservationTimespan: this.selectedObservationTimespan(),
        selectedTimelineWindow: this.observationTimelineWindow(),
      });
    }

    this.dataPointsApi
      .getWeatherStormWater(center)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((points) => {
        if (this.debugIntoto) {
          console.log('[DashboardMap] storm water points received', {
            count: points.length,
            points: points.map((point) => ({
              name: point.name,
              location: point.location,
              lastUpdatedOn: point.lastUpdatedOn?.toISOString(),
              data: point.data,
            })),
          });
        }

        this.handleDataPointsByType(points, DataPointType.STORM_WATER);
      });

    this.dataPointsApi
      .getWaterbagTestKits()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe((points) =>
        this.handleDataPointsByType(points, DataPointType.WATERBAG_TESTKIT),
      );
  }

  private handleDataPointsByType(
    dataPoints: DataPoint[],
    type: DataPointType,
  ): void {
    if (this.debugIntoto && type === DataPointType.STORM_WATER) {
      console.log('[DashboardMap] handleDataPointsByType(STORM_WATER)', {
        incomingCount: dataPoints.length,
        filteredWindow: this.observationTimelineWindow(),
      });
    }

    this._allDataPoints.update((current) =>
      current.filter((point) => point.type !== type).concat(dataPoints),
    );

    switch (type) {
      case DataPointType.WEATHER_CONDITIONS:
        this._weatherConditionDataPointMarkersLoadingSubject$.next(false);
        break;
      case DataPointType.STORM_WATER:
        this._weatherStormWaterDataPointMarkersLoadingSubject$.next(false);
        break;
      case DataPointType.AIR_QUALITY:
        this._weatherAirQualityDataPointMarkersLoadingSubject$.next(false);
        break;
      case DataPointType.PARKING:
        this._parkingDataPointMarkersLoadingSubject$.next(false);
        break;
      case DataPointType.WATERBAG_TESTKIT:
        this._waterbagTestkitDataPointMarkersLoadingSubject$.next(false);
        break;
      case DataPointType.ROAD_WORKS:
        this._roadWorksDataPointMarkersLoadingSubject$.next(false);
        break;
    }
  }

  private isPointWithinBounds(
    location: LatLong,
    bounds: MapBounds | null,
  ): boolean {
    if (!bounds) {
      return true;
    }

    const [latitude, longitude] = location;
    const longitudeInBounds =
      bounds.west <= bounds.east
        ? longitude >= bounds.west && longitude <= bounds.east
        : longitude >= bounds.west || longitude <= bounds.east;

    return (
      latitude >= bounds.south && latitude <= bounds.north && longitudeInBounds
    );
  }
}
