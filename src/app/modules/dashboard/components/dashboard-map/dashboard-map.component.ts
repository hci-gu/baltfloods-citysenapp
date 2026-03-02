import { animate, style, transition, trigger } from '@angular/animations';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
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
import { DashboardFilterComponent } from '../dashboard-filter/dashboard-filter.component';

interface ObservationFeedItem {
  id: string;
  name: string;
  location: LatLong;
  type: DataPointType;
  lastUpdatedOn?: Date;
  imageUrl?: string;
}

type ObservationTimespanKey = '7d' | '30d' | '90d' | '365d' | 'all';

interface ObservationTimespanOption {
  key: ObservationTimespanKey;
  label: string;
  days: number | null;
}

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
    DashboardFilterComponent,
  ],
})
export class DashboardMapComponent implements AfterViewInit {
  private _allDataPoints = signal<DataPoint[]>([]);
  public showObservationTimespanFilter = signal<boolean>(false);
  public selectedObservationTimespan = signal<ObservationTimespanKey>('30d');
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
        ?.label ?? 'Last 30 days'
    );
  });

  public showDataPointTypeFilter = signal<boolean>(false);
  public dataPointTypeFilter = signal<DataPointType[]>([]);
  private _filteredDataPoints$: Observable<DataPoint[]> = combineLatest([
    toObservable(this._allDataPoints),
    toObservable(this.dataPointTypeFilter),
    toObservable(this.selectedObservationTimespan),
  ]).pipe(
    map(([allDataPoints, dataPointFilter, selectedTimespan]) => {
      const timeFilteredDataPoints = allDataPoints.filter((point) =>
        this.isDataPointWithinTimespan(point, selectedTimespan),
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

    if (latLong) {
      return this._allDataPoints().filter((point) =>
        isSameLocation(point.location, latLong),
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
    const selectedKey = this.selectedObservationTimespan();
    const selectedOption = this.observationTimespanOptions.find(
      (option) => option.key === selectedKey,
    );

    if (!selectedOption || selectedOption.days === null) {
      return this._observationFeed();
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - selectedOption.days);
    const cutoffTime = cutoffDate.getTime();

    return this._observationFeed().filter((item) =>
      this.isTimestampWithinCutoff(item.lastUpdatedOn, cutoffTime),
    );
  });

  public dataPointMarkers$: Observable<Marker[]> = combineLatest([
    this._filteredDataPoints$,
    toObservable(this._activeLocation),
  ]).pipe(
    map(([points, activeLocation]) =>
      this.createMarkersFromDataPoints(points, activeLocation),
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

    effect(
      () => this._activeLocation() && this.showDataPointTypeFilter.set(false),
    );
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

  public onFilterOpen(): void {
    this.showDataPointTypeFilter.set(true);
  }

  public onFilterClose(): void {
    this.showDataPointTypeFilter.set(false);
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
    this.showObservationTimespanFilter.set(false);
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

  private isDataPointWithinTimespan(
    point: DataPoint,
    selectedTimespan: ObservationTimespanKey,
  ): boolean {
    const selectedOption = this.observationTimespanOptions.find(
      (option) => option.key === selectedTimespan,
    );
    if (!selectedOption || selectedOption.days === null) {
      return true;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - selectedOption.days);
    const cutoffTime = cutoffDate.getTime();

    return this.isTimestampWithinCutoff(point.lastUpdatedOn, cutoffTime);
  }

  private isTimestampWithinCutoff(
    timestamp: Date | undefined,
    cutoffTime: number,
  ): boolean {
    if (!timestamp) {
      return true;
    }
    return timestamp.getTime() >= cutoffTime;
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
