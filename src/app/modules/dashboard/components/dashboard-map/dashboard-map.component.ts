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
  SENSOR_THRESHOLDS_BY_SERIES_ID,
  SensorThresholdConfig,
} from '@core/config/sensor-thresholds';
import {
  DataPoint,
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
import { Router } from '@angular/router';
import {
  MapBounds,
  MapComponent,
  Marker,
} from '@shared/components/map/map.component';
import { calculateDistanceKm } from '@shared/utils/location-utils';
import { isEqual } from 'lodash-es';
import { MessageService, PrimeTemplate } from 'primeng/api';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  filter,
  map,
  Observable,
  of,
  shareReplay,
  Subject,
  switchMap,
  take,
  withLatestFrom,
} from 'rxjs';
import { DashboardDataPointDetailComponent } from '../dashboard-data-point-detail/dashboard-data-point-detail.component';
import { DashboardMessageBannerComponent } from '../dashboard-message-banner/dashboard-message-banner.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { AsyncPipe, DatePipe } from '@angular/common';
import { Toast } from 'primeng/toast';
import { ObservationDraftService } from '@core/services/observation-draft.service';
import {
  DAY_MS,
  DISPLAY_MODE_OPTIONS,
  OBSERVATION_REFRESH_MIN_DISTANCE_KM,
  OBSERVATION_REFRESH_VIEWPORT_FRACTION,
  OBSERVATION_TIMESPAN_OPTIONS,
  TIMELINE_SELECTION_RANGE_OPTIONS,
} from './dashboard-map.constants';
import {
  MapDisplayMode,
  MobileBottomPanel,
  ObservationFeedItem,
  ObservationTimeline,
  ObservationTimelineWindow,
  ObservationTimelineWindowStyle,
  ObservationTimespanBounds,
  ObservationTimespanKey,
  SensorTimelineCursor,
  SensorValueTimeline,
  TimelineSelectionRangeKey,
} from './dashboard-map.types';
import {
  formatDateForInput,
  getDayEnd,
  getDayStart,
  getDefaultSensorViewStartDate,
  isTimestampWithinRange,
  normalizeDateInput,
  parseDateInput,
} from './dashboard-date.utils';
import {
  getPointerRatio,
  isPointWithinBounds,
} from './dashboard-map-geometry.utils';
import { DashboardSensorHistoryService } from './services/dashboard-sensor-history.service';
import { DashboardSensorWarningsService } from './services/dashboard-sensor-warnings.service';
import { DashboardMapMarkersService } from './services/dashboard-map-markers.service';
import { DashboardTimelineService } from './services/dashboard-timeline.service';
import { DashboardObservationFeedService } from './services/dashboard-observation-feed.service';

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
  public readonly observationTimespanOptions = OBSERVATION_TIMESPAN_OPTIONS;
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
      const now = new Date(Date.now());
      const endMs = getDayEnd(now).getTime();
      const selectedKey = this.selectedObservationTimespan();
      const selectedOption = this.observationTimespanOptions.find(
        (option) => option.key === selectedKey,
      );

      const durationDays = selectedOption?.days ?? 365;
      const start = new Date(now);
      start.setDate(now.getDate() - (durationDays - 1));
      const startMs = getDayStart(start).getTime();
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
  public readonly displayModeOptions = DISPLAY_MODE_OPTIONS;
  public readonly selectionRangeOptions = TIMELINE_SELECTION_RANGE_OPTIONS;
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
  private readonly sensorHistoryService = inject(DashboardSensorHistoryService);
  private readonly sensorWarningsService = inject(
    DashboardSensorWarningsService,
  );
  private readonly mapMarkersService = inject(DashboardMapMarkersService);
  private readonly timelineService = inject(DashboardTimelineService);
  private readonly observationFeedService = inject(
    DashboardObservationFeedService,
  );
  private readonly sensorHistoryCache =
    this.sensorHistoryService.sensorHistoryCache;
  private _filteredDataPoints$: Observable<DataPoint[]> = combineLatest([
    toObservable(this._allDataPoints),
    toObservable(this.dataPointTypeFilter),
    toObservable(this.observationTimelineWindow),
    toObservable(this.visibleMapBounds),
    toObservable(this.sensorHistoryCache),
    toObservable(this.observationTimespanBounds),
  ]).pipe(
    map(
      ([
        allDataPoints,
        dataPointFilter,
        selectedWindow,
        bounds,
        sensorHistoryCache,
        observationBounds,
      ]) => {
        const timeFilteredDataPoints = allDataPoints.filter(
          (point) =>
            isPointWithinBounds(point.location, bounds) &&
            this.sensorHistoryService.isPointVisibleInCurrentTimeContext(
              point,
              selectedWindow,
              observationBounds,
              sensorHistoryCache,
            ),
        );

        return dataPointFilter.length > 0
          ? timeFilteredDataPoints.filter((point) =>
              dataPointFilter.includes(point.type),
            )
          : timeFilteredDataPoints;
      },
    ),
  );

  private _activeLocation = signal<LatLong | undefined>(undefined);
  public activeScheduledMessages = signal<ScheduledMessage[]>([]);
  private dismissedScheduledMessageIds = signal<Set<string>>(new Set());
  public sensorWarningMessages = computed<DashboardMessage[]>(() => {
    const bounds = this.observationTimespanBounds();
    const cache = this.sensorHistoryCache();

    return this.sensorHistoryService
      .getIntotoStormWaterPoints(this._allDataPoints())
      .filter((point) =>
        isPointWithinBounds(point.location, this.visibleMapBounds()),
      )
      .map((point) => {
        const seriesId = point.historySeries?.seriesId;
        if (seriesId === undefined) {
          return null;
        }

        const cacheEntry =
          cache[
            this.sensorHistoryService.getSensorHistoryCacheKey(seriesId, bounds)
          ];
        if (!cacheEntry) {
          return null;
        }

        return this.sensorWarningsService.buildSensorWarningMessage(
          point,
          cacheEntry.historyPoints,
          bounds,
        );
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
      const candidatePoints = this._allDataPoints().filter(
        (point) =>
          isPointWithinBounds(point.location, bounds) &&
          isTimestampWithinRange(
            point.lastUpdatedOn,
            selectedWindow.startMs,
            selectedWindow.endMs,
          ) &&
          this.matchesTypeFilter(point.type, activeTypeFilter),
      );

      const activeCluster = this.mapMarkersService
        .createDataPointClusters(candidatePoints, bounds)
        .find((cluster) =>
          this.mapMarkersService.isClusterActive(cluster, latLong),
        );

      return activeCluster?.points ?? null;
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
  private selectedSensorAvailableBounds = computed<ObservationTimespanBounds>(
    () => {
      const fallbackBounds = this.observationTimespanBounds();
      const seriesId = this.selectedSensorPoint()?.historySeries?.seriesId;
      if (seriesId === undefined) {
        return fallbackBounds;
      }

      const currentTimeMs = Date.now();
      const widestCacheEntry = Object.values(this.sensorHistoryCache())
        .filter(
          (entry) =>
            entry.seriesId === seriesId && entry.historyPoints.length > 0,
        )
        .sort((left, right) =>
          this.sensorHistoryService.compareSensorHistoryCacheEntriesForCurrentTime(
            left,
            right,
            currentTimeMs,
          ),
        )[0];
      if (!widestCacheEntry) {
        return fallbackBounds;
      }

      const firstPoint = widestCacheEntry.historyPoints[0];
      const lastPoint =
        widestCacheEntry.historyPoints[
          widestCacheEntry.historyPoints.length - 1
        ];
      const endMs = Math.min(lastPoint.timestamp.getTime(), currentTimeMs);
      const startMs = getDayStart(firstPoint.timestamp).getTime();

      return {
        startMs,
        endMs,
        durationMs: Math.max(DAY_MS, endMs - startMs),
      };
    },
  );
  public selectedSensorViewBounds = computed<ObservationTimespanBounds>(() => {
    const availableBounds = this.selectedSensorAvailableBounds();
    const fullStart = new Date(availableBounds.startMs);
    const fullEnd = new Date(availableBounds.endMs);
    const defaultStart = getDefaultSensorViewStartDate(fullEnd);
    const parsedStart = parseDateInput(this.sensorViewStartDate());
    const parsedEnd = parseDateInput(this.sensorViewEndDate());
    const startDate = this.sensorViewFullPeriod()
      ? fullStart
      : (parsedStart ?? defaultStart);
    const endDate = parsedEnd ?? fullEnd;
    let startMs = Math.max(
      getDayStart(startDate).getTime(),
      availableBounds.startMs,
    );
    const endMs = Math.min(getDayEnd(endDate).getTime(), availableBounds.endMs);

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
    formatDateForInput(new Date(this.selectedSensorViewBounds().startMs)),
  );
  public selectedSensorViewEndInput = computed(() =>
    formatDateForInput(new Date(this.selectedSensorViewBounds().endMs)),
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

    return this.timelineService.buildSensorValueTimeline(
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
    this.observationFeedService.buildObservationFeed(
      this._allDataPoints(),
      this.visibleMapBounds(),
    ),
  );
  public observationFeed = computed<ObservationFeedItem[]>(() => {
    const selectedWindow = this.observationTimelineWindow();
    const activeTypeFilter = this.dataPointTypeFilter();

    return this._observationFeed().filter(
      (item) =>
        isTimestampWithinRange(
          item.lastUpdatedOn,
          selectedWindow.startMs,
          selectedWindow.endMs,
        ) && this.matchesTypeFilter(item.type, activeTypeFilter),
    );
  });
  public observationTimeline = computed<ObservationTimeline>(() =>
    this.timelineService.buildObservationTimeline(
      this._observationFeed(),
      this.observationTimespanBounds(),
      this.dataPointTypeFilter(),
      (type) => this.getObservationTypeLabel(type),
    ),
  );

  public mapMarkers$!: Observable<Marker[]>;

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
  private latestUserLocation?: LatLong;

  private _focusLocation$ = new Subject<void>();
  private lastObservationRefreshCenter?: LatLong;
  private waterbagTestKitsLoaded = false;

  private readonly destroyRef = inject(DestroyRef);
  private readonly debugIntoto = !environment.production;
  private readonly userLocation$!: Observable<UserLocation>;

  public constructor(
    private readonly locationService: LocationService,
    private readonly dataPointsApi: DataPointsApi,
    private readonly observationRealtimeService: ObservationRealtimeService,
    private readonly scheduledMessagesService: ScheduledMessagesService,
    private readonly messageService: MessageService,
    private readonly translateService: TranslateService,
    private readonly observationDraftService: ObservationDraftService,
    private readonly router: Router,
  ) {
    this.userLocation$ = this.locationService.userLocation$.pipe(
      shareReplay(1),
    );
    this.mapMarkers$ = combineLatest([
      this._filteredDataPoints$,
      toObservable(this._activeLocation),
      toObservable(this.selectedDisplayMode),
      this.userLocation$,
      toObservable(this.sensorHistoryCache),
    ]).pipe(
      map(
        ([
          points,
          activeLocation,
          displayMode,
          userLocation,
          sensorHistoryCache,
        ]) => {
          const dataPointMarkers =
            displayMode === 'heatmap'
              ? this.mapMarkersService.createHeatmapMarkers(points)
              : this.mapMarkersService.createMarkersFromDataPoints(
                  points,
                  activeLocation,
                  sensorHistoryCache,
                  this.observationTimespanBounds(),
                  this.visibleMapBounds(),
                );
          const userLocationMarker =
            this.mapMarkersService.createUserLocationMarker(userLocation);

          return userLocationMarker
            ? [...dataPointMarkers, userLocationMarker]
            : dataPointMarkers;
        },
      ),
      shareReplay(1),
    );

    this.userLocation$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ location }) => {
        if (location) {
          this.latestUserLocation = location;
        }
      });

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
      .watchActiveMessages()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((messages) => this.activeScheduledMessages.set(messages));

    combineLatest([
      toObservable(this._allDataPoints),
      toObservable(this.observationTimespanBounds),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([points, bounds]) =>
        this.prefetchSensorHistories(
          this.sensorHistoryService.getIntotoStormWaterPoints(points),
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
            return of({
              point,
              bounds,
              historyPoints: [] as SensorHistoryPoint[],
            });
          }

          this.selectedSensorHistoryLoading.set(true);
          return this.sensorHistoryService
            .loadSensorHistory(point, bounds)
            .pipe(
              map((historyPoints) => ({
                point,
                bounds,
                historyPoints,
              })),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ point, bounds, historyPoints }) => {
        this.selectedSensorHistoryPoints.set(historyPoints);
        this.setDefaultSensorCursorRatio(point, bounds, historyPoints);
        this.selectedSensorHistoryLoading.set(false);
      });

    this.onInitialFocusLocation();
  }

  public ngAfterViewInit(): void {
    this.showLoadingDataToast();
  }

  public onMarkerClick(latLong: LatLong): void {
    this.currentMapCenter = latLong;
    this._mapCenterSubject$.next(latLong);
    this.setMobileBottomPanel(null);
    this.resetSensorViewRange();
    this.setActiveMarker(latLong);
  }

  public onDataPointClose(): void {
    this.resetSensorViewRange();
    this.setActiveMarker();
  }

  public onMapCenterChange(latLong: LatLong): void {
    this.currentMapCenter = latLong;
    this.refreshObservationDataPoints(latLong);
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

  public onQuickObservationCameraClick(): void {
    this.locationService.refreshUserLocation();
  }

  public onQuickObservationPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const photo = input.files?.[0] ?? null;
    input.value = '';

    if (!photo) {
      return;
    }

    this.observationDraftService.setQuickObservationDraft({
      location: this.latestUserLocation ?? this.currentMapCenter,
      observationType: 'water_overflow',
      photo,
    });

    void this.router.navigate(['/observation'], {
      queryParams: { quick: '1' },
      queryParamsHandling: 'merge',
    });
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
    this.setMobileBottomPanel(null);
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
    const normalized = normalizeDateInput(
      value,
      this.observationTimespanBounds(),
    );
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
    const normalized = normalizeDateInput(
      value,
      this.observationTimespanBounds(),
    );
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

    const pointerRatio = getPointerRatio(event, container);
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

    const pointerRatio = getPointerRatio(event, container);
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
    this.setSensorCursorRatio(getPointerRatio(event, container));
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

    this.setSensorCursorRatio(getPointerRatio(event, container));
    event.preventDefault();
  }

  public onSensorCursorPointerUp(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  public getObservationTypeLabel(type: DataPointType): string {
    return this.observationFeedService.getObservationTypeLabel(type);
  }

  public getObservationFeedTypeLabel(point: DataPoint): string {
    return this.observationFeedService.getObservationFeedTypeLabel(point);
  }

  public getObservationTypeColor(type: DataPointType): string {
    return this.observationFeedService.getObservationTypeColor(type);
  }

  public isTypeFilterActive(type: DataPointType): boolean {
    return this.dataPointTypeFilter().includes(type);
  }

  private matchesTypeFilter(
    type: DataPointType,
    typeFilter: DataPointType[],
  ): boolean {
    return typeFilter.length === 0 || typeFilter.includes(type);
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
    this.locationPermissionState$ =
      this.locationService.locationPermissionState$;
    this.locationLoading$ = this.userLocation$.pipe(
      map(({ loading }) => loading),
    );

    this._focusLocation$
      .pipe(
        withLatestFrom(
          this.userLocation$,
          this.locationService.locationPermissionState$,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(([_, userLocation, permissionState]) =>
        this.onFocusLocation(userLocation, permissionState),
      );

    combineLatest([
      this.userLocation$,
      this.locationService.locationPermissionState$,
    ])
      .pipe(
        filter(
          ([userLocation, permissionState]) =>
            !userLocation.loading &&
            permissionState === 'granted' &&
            !!userLocation.location,
        ),
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

  private prefetchSensorHistories(
    points: WeatherStormWaterDataPoint[],
    bounds: ObservationTimespanBounds,
  ): void {
    points.forEach((point) => {
      this.sensorHistoryService
        .loadSensorHistory(point, bounds)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe();
    });
  }

  private setDefaultSensorCursorRatio(
    point: WeatherStormWaterDataPoint | null,
    bounds: ObservationTimespanBounds,
    historyPoints: SensorHistoryPoint[],
  ): void {
    const seriesId = point?.historySeries?.seriesId;
    const thresholdConfig =
      seriesId !== undefined
        ? (SENSOR_THRESHOLDS_BY_SERIES_ID[seriesId] ?? null)
        : null;
    if (!thresholdConfig || historyPoints.length === 0) {
      this.sensorCursorRatio.set(1);
      return;
    }

    const activeThresholdPoint =
      this.sensorWarningsService.getActiveSensorHistoryThresholdPoint(
        historyPoints,
        thresholdConfig,
      );
    if (!activeThresholdPoint) {
      this.sensorCursorRatio.set(1);
      return;
    }

    const rawRatio =
      (activeThresholdPoint.historyPoint.timestamp.getTime() - bounds.startMs) /
      bounds.durationMs;
    this.setSensorCursorRatio(rawRatio);
  }

  private refreshObservationDataPoints(
    center: LatLong = this.currentMapCenter,
    force = false,
  ): void {
    if (this.shouldRefreshStormWaterData(center, force)) {
      this.lastObservationRefreshCenter = center;

      this.logIntotoDebug('[DashboardMap] refresh storm water data points', {
        center,
        force,
        selectedObservationTimespan: this.selectedObservationTimespan(),
        selectedTimelineWindow: this.observationTimelineWindow(),
      });

      this.dataPointsApi
        .getWeatherStormWater(center)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((points) => {
          this.logIntotoDebug('[DashboardMap] storm water points received', {
            count: points.length,
            points: points.map((point) => ({
              name: point.name,
              location: point.location,
              lastUpdatedOn: point.lastUpdatedOn?.toISOString(),
              data: point.data,
            })),
          });

          this.handleDataPointsByType(points, DataPointType.STORM_WATER);
        });
    }

    if (force || !this.waterbagTestKitsLoaded) {
      this.waterbagTestKitsLoaded = true;
      this.dataPointsApi
        .getWaterbagTestKits()
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe((points) =>
          this.handleDataPointsByType(points, DataPointType.WATERBAG_TESTKIT),
        );
    }
  }

  private shouldRefreshStormWaterData(
    center: LatLong,
    force: boolean,
  ): boolean {
    if (force || !this.lastObservationRefreshCenter) {
      return true;
    }

    return (
      calculateDistanceKm(this.lastObservationRefreshCenter, center) >=
      this.getObservationRefreshDistanceKm()
    );
  }

  private getObservationRefreshDistanceKm(): number {
    const bounds = this.visibleMapBounds();
    if (!bounds) {
      return OBSERVATION_REFRESH_MIN_DISTANCE_KM;
    }

    const latSpanKm = calculateDistanceKm(
      [bounds.south, bounds.west],
      [bounds.north, bounds.west],
    );
    const longSpanKm = calculateDistanceKm(
      [bounds.south, bounds.west],
      [bounds.south, bounds.east],
    );
    const viewportRefreshDistanceKm =
      Math.max(latSpanKm, longSpanKm) * OBSERVATION_REFRESH_VIEWPORT_FRACTION;

    return Math.max(
      OBSERVATION_REFRESH_MIN_DISTANCE_KM,
      viewportRefreshDistanceKm,
    );
  }

  private handleDataPointsByType(
    dataPoints: DataPoint[],
    type: DataPointType,
  ): void {
    if (type === DataPointType.STORM_WATER) {
      this.logIntotoDebug(
        '[DashboardMap] handleDataPointsByType(STORM_WATER)',
        {
          incomingCount: dataPoints.length,
          filteredWindow: this.observationTimelineWindow(),
        },
      );
    }

    this._allDataPoints.update((current) => {
      const existingDataPoints = current.filter((point) => point.type === type);
      if (isEqual(existingDataPoints, dataPoints)) {
        return current;
      }

      return current.filter((point) => point.type !== type).concat(dataPoints);
    });

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

  private logIntotoDebug(message: string, context: unknown): void {
    if (!this.debugIntoto) {
      return;
    }

    // eslint-disable-next-line no-console
    console.debug(message, context);
  }
}
