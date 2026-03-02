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
  DATA_POINT_QUALITY_COLOR_CHART,
  DATA_POINT_TYPE_ICON,
  DataPoint,
  DataPointQuality,
  DataPointType,
} from '@core/models/data-point';
import { LatLong } from '@core/models/location';
import { DataPointsApi } from '@core/services/datapoints-api/datapoints-api.service';
import { LocationService, UserLocation } from '@core/services/location.service';
import {
  ScheduledMessage,
  ScheduledMessagesService,
} from '@core/services/scheduled-messages.service';
import { environment } from '@environments/environment';
import { TranslateService } from '@ngx-translate/core';
import { MapComponent, Marker } from '@shared/components/map/map.component';
import { isSameLocation } from '@shared/utils/location-utils';
import { groupBy } from 'lodash-es';
import { MessageService, PrimeTemplate } from 'primeng/api';
import {
  BehaviorSubject,
  combineLatest,
  filter,
  map,
  Observable,
  Subject,
  take,
  withLatestFrom,
} from 'rxjs';
import { DashboardDataPointDetailComponent } from '../dashboard-data-point-detail/dashboard-data-point-detail.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { AsyncPipe, DatePipe } from '@angular/common';
import { Toast } from 'primeng/toast';

interface ObservationFeedItem {
  id: string;
  name: string;
  location: LatLong;
  type: DataPointType;
  lastUpdatedOn?: Date;
  imageUrl?: string;
}

type ObservationTimespanKey = '7d' | '30d' | '90d' | '365d' | 'all';
type MapDisplayMode = 'default' | 'heatmap';
type TimelineSelectionRangeKey = '7d' | '14d' | '30d' | '60d' | '90d';

interface ObservationTimespanOption {
  key: ObservationTimespanKey;
  label: string;
  days: number | null;
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

const OBSERVATION_TIMELINE_COLOR: Record<DataPointType, string> = {
  [DataPointType.WEATHER_CONDITIONS]: '#0284c7',
  [DataPointType.AIR_QUALITY]: '#ea580c',
  [DataPointType.STORM_WATER]: '#15803d',
  [DataPointType.PARKING]: '#4f46e5',
  [DataPointType.ROAD_WORKS]: '#b45309',
  [DataPointType.WATERBAG_TESTKIT]: '#0f766e',
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-dashboard-map',
  templateUrl: './dashboard-map.component.html',
  styleUrls: ['./dashboard-map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideInAndOut', [
      transition(':enter', [
        style({ transform: 'translateY(100%)' }),
        animate('200ms ease-in-out', style({ transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        style({ transform: 'translateY(0)' }),
        animate('150ms ease-in-out', style({ transform: 'translateY(100%)' })),
      ]),
    ]),
  ],
  standalone: true,
  imports: [
    MapComponent,
    DashboardDataPointDetailComponent,
    IconComponent,
    AsyncPipe,
    DatePipe,
    Toast,
    PrimeTemplate,
  ],
})
export class DashboardMapComponent implements AfterViewInit {
  private _allDataPoints = signal<DataPoint[]>([]);
  private readonly timelinePaddingTop = 7;
  private readonly timelinePaddingBottom = 8;
  private readonly timelinePaddingHorizontal = 2;
  private timelineWindowStartRatio = signal<number>(1);
  private timelineWindowDragOffsetRatio = 0;
  public showTypeFilterDropdown = signal<boolean>(false);
  public showDisplayModeDropdown = signal<boolean>(false);
  public showSelectionRangeDropdown = signal<boolean>(false);
  public selectedDisplayMode = signal<MapDisplayMode>('default');
  public showObservationTimespanFilter = signal<boolean>(false);
  public selectedObservationTimespan = signal<ObservationTimespanKey>('365d');
  public readonly observationTimespanOptions: ObservationTimespanOption[] = [
    { key: '7d', label: 'Last 7 days', days: 7 },
    { key: '30d', label: 'Last 30 days', days: 30 },
    { key: '90d', label: 'Last 90 days', days: 90 },
    { key: '365d', label: 'Last year', days: 365 },
    { key: 'all', label: 'All time', days: null },
  ];
  public selectedObservationTimespanLabel = computed(() => {
    const selectedKey = this.selectedObservationTimespan();
    return (
      this.observationTimespanOptions.find((option) => option.key === selectedKey)
        ?.label ?? 'Last year'
    );
  });
  private observationTimespanBounds = computed<ObservationTimespanBounds>(() => {
    const now = new Date();
    const endMs = this.getDayEnd(now).getTime();
    const selectedKey = this.selectedObservationTimespan();
    const selectedOption = this.observationTimespanOptions.find(
      (option) => option.key === selectedKey,
    );

    if (selectedOption?.days) {
      const start = new Date(now);
      start.setDate(now.getDate() - (selectedOption.days - 1));
      const startMs = this.getDayStart(start).getTime();
      return {
        startMs,
        endMs,
        durationMs: Math.max(DAY_MS, endMs - startMs),
      };
    }

    const observationsWithDate = this._observationFeed().filter(
      (item) => item.lastUpdatedOn,
    ) as Array<ObservationFeedItem & { lastUpdatedOn: Date }>;
    const earliest = observationsWithDate.length
      ? observationsWithDate.reduce(
          (min, item) =>
            item.lastUpdatedOn.getTime() < min.getTime()
              ? item.lastUpdatedOn
              : min,
          observationsWithDate[0].lastUpdatedOn,
        )
      : this.getDayStart(new Date(endMs - 364 * DAY_MS));

    const startMs = this.getDayStart(earliest).getTime();
    return {
      startMs,
      endMs,
      durationMs: Math.max(DAY_MS, endMs - startMs),
    };
  });
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
  public observationTimelineWindowStyle = computed<ObservationTimelineWindowStyle>(
    () => ({
      leftPercent: this.observationTimelineWindow().startRatio * 100,
      widthPercent: this.observationTimelineWindow().widthRatio * 100,
    }),
  );
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
  private _filteredDataPoints$: Observable<DataPoint[]> = combineLatest([
    toObservable(this._allDataPoints),
    toObservable(this.dataPointTypeFilter),
    toObservable(this.observationTimelineWindow),
  ]).pipe(
    map(([allDataPoints, dataPointFilter, selectedWindow]) => {
      const timeFilteredDataPoints = allDataPoints.filter((point) =>
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
  private dismissedScheduledMessageIds = signal<Set<string>>(new Set());
  public visibleScheduledMessages = computed(() =>
    this.activeScheduledMessages().filter(
      (message) => !this.dismissedScheduledMessageIds().has(message.id),
    ),
  );
  public selectedDataPoints = computed(() => {
    const latLong = this._activeLocation();
    const selectedWindow = this.observationTimelineWindow();
    const activeTypeFilter = this.dataPointTypeFilter();

    if (latLong) {
      return this._allDataPoints().filter(
        (point) =>
          isSameLocation(point.location, latLong) &&
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
  private _observationFeed = computed<ObservationFeedItem[]>(() =>
    this._allDataPoints()
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
        lastUpdatedOn: point.lastUpdatedOn,
        imageUrl: this.getObservationImageUrl(point),
      })),
  );
  public observationFeed = computed<ObservationFeedItem[]>(() => {
    const selectedWindow = this.observationTimelineWindow();
    const activeTypeFilter = this.dataPointTypeFilter();

    return this._observationFeed().filter((item) =>
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
    const bucketSizeDays =
      totalDays > 540 ? 30 : totalDays > 180 ? 7 : 1;
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
            .map((point, index) =>
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

  private _focusLocation$ = new Subject<void>();

  private readonly destroyRef = inject(DestroyRef);

  public constructor(
    private readonly locationService: LocationService,
    private readonly dataPointsApi: DataPointsApi,
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
      .getWeatherStormWater()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((points) =>
        this.handleDataPointsByType(points, DataPointType.STORM_WATER),
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

    this.dataPointsApi
      .getWaterbagTestKits()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((points) =>
        this.handleDataPointsByType(points, DataPointType.WATERBAG_TESTKIT),
      );

    this.dataPointsApi
      .getRoadWorks()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((points) =>
        this.handleDataPointsByType(points, DataPointType.ROAD_WORKS),
      );

    this.scheduledMessagesService
      .getActiveMessages()
      .pipe(take(1), takeUntilDestroyed())
      .subscribe((messages) => this.activeScheduledMessages.set(messages));

    this._focusLocation$
      .pipe(take(1), takeUntilDestroyed())
      .subscribe(this.onInitialFocusLocation.bind(this));
  }

  public ngAfterViewInit(): void {
    this.showLoadingDataToast();
  }

  public onMarkerClick(latLong: LatLong): void {
    this.setActiveMarker(latLong);
  }

  public onDataPointClose(): void {
    this.setActiveMarker();
  }

  public toggleTypeFilterDropdown(): void {
    this.showTypeFilterDropdown.update((open) => !open);
    this.showDisplayModeDropdown.set(false);
    this.showSelectionRangeDropdown.set(false);
  }

  public toggleDisplayModeDropdown(): void {
    this.showDisplayModeDropdown.update((open) => !open);
    this.showTypeFilterDropdown.set(false);
    this.showSelectionRangeDropdown.set(false);
  }

  public toggleSelectionRangeDropdown(): void {
    this.showSelectionRangeDropdown.update((open) => !open);
    this.showTypeFilterDropdown.set(false);
    this.showDisplayModeDropdown.set(false);
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
    this._mapCenterSubject$.next(location);
    void this.setActiveMarker(location);
  }

  public toggleObservationTimespanFilter(): void {
    this.showObservationTimespanFilter.update((value) => !value);
  }

  public setObservationTimespan(key: ObservationTimespanKey): void {
    this.selectedObservationTimespan.set(key);
    this.timelineWindowStartRatio.set(1);
    this.showObservationTimespanFilter.set(false);
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
    const trimmed = imageUrl.trim();

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith('/')) {
      return trimmed;
    }

    if (trimmed.startsWith('../')) {
      return `/${trimmed.replace(/^(\.\.\/)+/, '')}`;
    }

    return `${environment.streetAiUploadUrl.replace(/\/$/, '')}/${trimmed.replace(/^\/+/, '')}`;
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
    this.locationLoading$ = userLocation$.pipe(
      map(({ loading }) => loading),
    );

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
          : DATA_POINT_TYPE_ICON[dataPoints[0].type],
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

  private handleDataPointsByType(
    dataPoints: DataPoint[],
    type: DataPointType,
  ): void {
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
}
