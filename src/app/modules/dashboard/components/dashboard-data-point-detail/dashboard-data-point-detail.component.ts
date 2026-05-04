import { DatePipe, KeyValuePipe } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  signal,
  SimpleChanges,
} from '@angular/core';
import {
  SENSOR_THRESHOLD_COLORS,
  SENSOR_THRESHOLDS_BY_SERIES_ID,
  SensorThresholdConfig,
  SensorThresholdSeverity,
} from '@core/config/sensor-thresholds';
import {
  DATA_POINT_QUALITY_COLOR_CHART,
  DataPoint,
  DataPointQuality,
  DataPointType,
  WeatherStormWaterDataPoint,
  WATERBAG_TESTKIT_METRIC_UNIT,
  WaterbagTestKitDataPoint,
  WaterbagTestKitDataPointData,
  WEATHER_CONDITIONS_METRIC_UNIT,
  WEATHER_STORM_WATER_METRIC_UNIT,
} from '@core/models/data-point';
import { RadarService } from '@core/services/radar.service';
import { environment } from '@environments/environment';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Chip } from 'primeng/chip';
import { Skeleton } from 'primeng/skeleton';
import { IconComponent } from '@shared/components/icon/icon.component';

@Component({
  selector: 'app-dashboard-data-point-detail',
  templateUrl: './dashboard-data-point-detail.component.html',
  styleUrls: ['./dashboard-data-point-detail.component.scss'],
  imports: [
    Chip,
    Skeleton,
    IconComponent,
    TranslatePipe,
    DatePipe,
    KeyValuePipe,
  ],
  standalone: true,
})
export class DashboardDataPointDetailComponent implements OnChanges {
  @Input({ required: true }) public dataPoints: DataPoint[] = [];

  @Output() public close: EventEmitter<void> = new EventEmitter<void>();

  public address = signal<string | null>(null);
  public name = signal<string | null>(null);
  public activeDataPoint = signal<DataPoint | null>(null);
  public activeDataPointIndex = signal<number>(0);

  public DATA_POINT_TYPE = DataPointType;
  private touchStartX: number | null = null;
  private headerRequestId = 0;

  public constructor(
    private readonly translateService: TranslateService,
    private readonly radarService: RadarService,
    private readonly datePipe: DatePipe,
  ) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['dataPoints']) {
      if (changes['dataPoints'].currentValue) {
        this.setActiveDataPoint(0);
      }
    }
  }

  public get hasMultipleDataPoints(): boolean {
    return this.dataPoints.length > 1;
  }

  public showPreviousDataPoint(): void {
    this.setActiveDataPoint(this.activeDataPointIndex() - 1);
  }

  public showNextDataPoint(): void {
    this.setActiveDataPoint(this.activeDataPointIndex() + 1);
  }

  public onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  public onTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null || !this.hasMultipleDataPoints) {
      this.touchStartX = null;
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? this.touchStartX;
    const deltaX = endX - this.touchStartX;
    this.touchStartX = null;

    if (Math.abs(deltaX) < 40) {
      return;
    }

    if (deltaX < 0) {
      this.showNextDataPoint();
      return;
    }

    this.showPreviousDataPoint();
  }

  public getWeatherConditionMetricValue(
    value: string | number,
  ): string | number {
    if (typeof value === 'number') {
      return Math.round(value * 10) / 10;
    }

    return this.getDataPointTranslation(
      DataPointType.WEATHER_CONDITIONS,
      value,
    );
  }

  public getStormWeatherMetricValue(
    value: string | number,
    key: string,
  ): string | number {
    if (key === 'dataRetrievedTimestamp') {
      const date = this.datePipe.transform(value, 'dd/MM/yyyy');
      return date ? date : '';
    }

    return value;
  }

  public getQualityTranslation(quality: DataPointQuality): string {
    return `DASHBOARD.DATA_POINTS.QUALITY.${DataPointQuality[quality]}`;
  }

  public getWaterbagTestkitValue(
    value: WaterbagTestKitDataPointData,
    key: keyof WaterbagTestKitDataPoint['data'],
  ): number {
    if (key === 'algae') {
      return this.translateService.instant(
        `DASHBOARD.DATA_POINTS.WATERBAG_TESTKIT.ALGAE_DESCRIPTION.${value.value}`,
      );
    }

    return value.calculatedValue ?? value.value;
  }

  public getDataQualityBackgroundColor(quality: DataPointQuality): string {
    return DATA_POINT_QUALITY_COLOR_CHART[quality];
  }

  public getDataQualityTextColor(quality: DataPointQuality): string {
    return quality === DataPointQuality.DEFAULT ? 'white' : 'black';
  }

  public getMetricUnit(type: DataPointType, key: string): string | undefined {
    if (type === DataPointType.WEATHER_CONDITIONS) {
      return (
        WEATHER_CONDITIONS_METRIC_UNIT[
          key as keyof typeof WEATHER_CONDITIONS_METRIC_UNIT
        ] ?? ''
      );
    }

    if (type === DataPointType.STORM_WATER) {
      return (
        WEATHER_STORM_WATER_METRIC_UNIT[
          key as keyof typeof WEATHER_STORM_WATER_METRIC_UNIT
        ] ?? ''
      );
    }

    if (type === DataPointType.WATERBAG_TESTKIT) {
      return (
        WATERBAG_TESTKIT_METRIC_UNIT[
          key as keyof typeof WATERBAG_TESTKIT_METRIC_UNIT
        ] ?? ''
      );
    }

    return undefined;
  }

  public getMetricUnitForDataPoint(
    point: DataPoint,
    key: string,
  ): string | undefined {
    if (
      point.type === DataPointType.STORM_WATER &&
      point.dataUnitOverrides?.[key]
    ) {
      return point.dataUnitOverrides[key];
    }

    return this.getMetricUnit(point.type, key);
  }

  public getStormWaterMetrics(
    dataPoint: WeatherStormWaterDataPoint,
  ): Array<{ key: string; value: string | number }> {
    return Object.entries(dataPoint.data)
      .filter(([key]) => key !== 'fillLevel')
      .map(([key, value]) => ({ key, value }));
  }

  public getSensorValue(dataPoint: WeatherStormWaterDataPoint): number | null {
    const value = dataPoint.data['waterLevel'];
    return typeof value === 'number' ? value : null;
  }

  public getSensorValueLabel(dataPoint: WeatherStormWaterDataPoint): string {
    const value = this.getSensorValue(dataPoint);

    if (value === null) {
      return 'No reading';
    }

    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }).format(value);
  }

  public getSensorStatusLabel(dataPoint: WeatherStormWaterDataPoint): string {
    const severity = this.getSensorSeverity(dataPoint);

    switch (severity) {
      case 'yellow':
        return 'Watch';
      case 'orange':
        return 'Warning';
      case 'red':
        return 'Critical';
      default:
        return 'Normal';
    }
  }

  public getSensorStatusDescription(
    dataPoint: WeatherStormWaterDataPoint,
  ): string {
    const severity = this.getSensorSeverity(dataPoint);

    switch (severity) {
      case 'yellow':
        return 'Above the watch threshold.';
      case 'orange':
        return 'Above the warning threshold.';
      case 'red':
        return 'Above the highest configured threshold.';
      default:
        return 'Within the normal range.';
    }
  }

  public getSensorStatusBackgroundColor(
    dataPoint: WeatherStormWaterDataPoint,
  ): string {
    return SENSOR_THRESHOLD_COLORS[this.getSensorSeverity(dataPoint)];
  }

  public getSensorStatusTextColor(
    dataPoint: WeatherStormWaterDataPoint,
  ): string {
    return this.getSensorSeverity(dataPoint) === 'yellow' ? '#111827' : 'white';
  }

  public getSensorAlertThresholdSummary(
    dataPoint: WeatherStormWaterDataPoint,
  ): string {
    const thresholdConfig = this.getSensorThresholdConfig(dataPoint);

    if (!thresholdConfig) {
      return 'No alert thresholds configured.';
    }

    const yellowThreshold = thresholdConfig.bands.find(
      (band) => band.severity === 'yellow',
    )?.value;
    const orangeThreshold = thresholdConfig.bands.find(
      (band) => band.severity === 'orange',
    )?.value;
    const highestThreshold = thresholdConfig.bands.reduce(
      (max, band) => Math.max(max, band.value),
      Number.NEGATIVE_INFINITY,
    );
    const unitLabel = thresholdConfig.unitLabel;
    const parts = [
      yellowThreshold !== undefined
        ? `Yellow ${yellowThreshold} ${unitLabel}`
        : null,
      orangeThreshold !== undefined
        ? `Orange ${orangeThreshold} ${unitLabel}`
        : null,
      Number.isFinite(highestThreshold)
        ? `Red above ${highestThreshold} ${unitLabel}`
        : null,
    ].filter((value): value is string => value !== null);

    return parts.join('  •  ');
  }

  public getSensorUnitLabel(dataPoint: WeatherStormWaterDataPoint): string {
    return (
      dataPoint.dataUnitOverrides?.['waterLevel'] ??
      dataPoint.historySeries?.unitLabel ??
      this.getMetricUnit(dataPoint.type, 'waterLevel') ??
      ''
    );
  }

  public isIntotoStormWaterDataPoint(
    dataPoint: WeatherStormWaterDataPoint,
  ): boolean {
    return dataPoint.historySeries?.provider === 'intoto';
  }

  public hasStormWaterFillLevel(
    dataPoint: WeatherStormWaterDataPoint,
  ): boolean {
    return dataPoint.data['fillLevel'] !== undefined;
  }

  public getDataPointTranslation(type: DataPointType, key: string): string {
    const i18nKey = `DASHBOARD.DATA_POINTS.${Object.values(DataPointType)[type]}.${key.toUpperCase()}`;
    return this.translateService.instant(i18nKey);
  }

  public getDataPointImageUrl(imageUrl: string): string {
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

  private getSensorSeverity(
    dataPoint: WeatherStormWaterDataPoint,
  ): SensorThresholdSeverity {
    const value = this.getSensorValue(dataPoint);
    const thresholdConfig = this.getSensorThresholdConfig(dataPoint);

    if (value === null || !thresholdConfig) {
      return 'green';
    }

    const matchingBands = thresholdConfig.bands.filter(
      (band) => value >= band.value,
    );

    if (matchingBands.length === 0) {
      return 'green';
    }

    const highestBand = matchingBands.reduce((currentHighest, band) =>
      band.value > currentHighest.value ? band : currentHighest,
    );
    const highestConfiguredValue = thresholdConfig.bands.reduce(
      (max, band) => Math.max(max, band.value),
      Number.NEGATIVE_INFINITY,
    );

    if (
      highestBand.severity !== 'red' &&
      value >= highestConfiguredValue &&
      Number.isFinite(highestConfiguredValue)
    ) {
      return 'red';
    }

    return highestBand.severity;
  }

  private getSensorThresholdConfig(
    dataPoint: WeatherStormWaterDataPoint,
  ): SensorThresholdConfig | null {
    const seriesId = dataPoint.historySeries?.seriesId;

    if (seriesId === undefined) {
      return null;
    }

    return SENSOR_THRESHOLDS_BY_SERIES_ID[seriesId] ?? null;
  }

  private setActiveDataPoint(index: number): void {
    const maxIndex = Math.max(0, this.dataPoints.length - 1);
    const nextIndex = Math.min(Math.max(index, 0), maxIndex);
    const nextDataPoint = this.dataPoints[nextIndex] ?? null;

    this.activeDataPointIndex.set(nextIndex);
    this.activeDataPoint.set(nextDataPoint);
    this.address.set(null);
    this.name.set(null);

    void this.setHeaderValues(nextDataPoint);
  }

  private async setHeaderValues(dataPoint: DataPoint | null): Promise<void> {
    const requestId = ++this.headerRequestId;

    if (!dataPoint) {
      return;
    }

    const dataPointName =
      dataPoint.type === DataPointType.WATERBAG_TESTKIT
        ? this.translateService.instant(
            'DASHBOARD.DATA_POINTS.WATERBAG_TESTKIT.TITLE',
          )
        : dataPoint.name;
    this.name.set(dataPointName);

    const address = await this.radarService.reverseGeocode(dataPoint.location);
    if (requestId !== this.headerRequestId) {
      return;
    }
    this.address.set(address);
  }
}
