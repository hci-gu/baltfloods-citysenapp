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
  DataPoint,
  DataPointQuality,
  DataPointType,
  WeatherStormWaterDataPoint,
  WaterbagTestKitDataPoint,
  WaterbagTestKitDataPointData,
} from '@core/models/data-point';
import { RadarService } from '@core/services/radar.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Chip } from 'primeng/chip';
import { Skeleton } from 'primeng/skeleton';
import { IconComponent } from '@shared/components/icon/icon.component';
import * as detailViewModel from './data-point-detail-view-model';
import * as sensorViewModel from './sensor-threshold-view-model';
import { StormWaterDetailComponent } from './storm-water-detail.component';
import { WaterbagTestkitDetailComponent } from './waterbag-testkit-detail.component';
import { WeatherConditionsDetailComponent } from './weather-conditions-detail.component';

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
    WeatherConditionsDetailComponent,
    StormWaterDetailComponent,
    WaterbagTestkitDetailComponent,
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
    return detailViewModel.getWeatherConditionMetricValue(
      value,
      this.translateService,
    );
  }

  public getStormWeatherMetricValue(
    value: string | number,
    key: string,
  ): string | number {
    return detailViewModel.getStormWeatherMetricValue(
      value,
      key,
      this.datePipe,
    );
  }

  public getQualityTranslation(quality: DataPointQuality): string {
    return detailViewModel.getQualityTranslation(quality);
  }

  public getWaterbagTestkitValue(
    value: WaterbagTestKitDataPointData,
    key: keyof WaterbagTestKitDataPoint['data'],
  ): number {
    return detailViewModel.getWaterbagTestkitValue(
      value,
      key,
      this.translateService,
    );
  }

  public getDataQualityBackgroundColor(quality: DataPointQuality): string {
    return detailViewModel.getDataQualityBackgroundColor(quality);
  }

  public getDataQualityTextColor(quality: DataPointQuality): string {
    return detailViewModel.getDataQualityTextColor(quality);
  }

  public getMetricUnit(type: DataPointType, key: string): string | undefined {
    return detailViewModel.getMetricUnit(type, key);
  }

  public getMetricUnitForDataPoint(
    point: DataPoint,
    key: string,
  ): string | undefined {
    return detailViewModel.getMetricUnitForDataPoint(point, key);
  }

  public getStormWaterMetrics(
    dataPoint: WeatherStormWaterDataPoint,
  ): { key: string; value: string | number }[] {
    return detailViewModel.getStormWaterMetrics(dataPoint);
  }

  public getSensorValue(dataPoint: WeatherStormWaterDataPoint): number | null {
    return sensorViewModel.getSensorValue(dataPoint);
  }

  public getSensorValueLabel(dataPoint: WeatherStormWaterDataPoint): string {
    return sensorViewModel.getSensorValueLabel(dataPoint);
  }

  public getSensorStatusLabel(dataPoint: WeatherStormWaterDataPoint): string {
    return sensorViewModel.getSensorStatusLabel(dataPoint);
  }

  public getSensorStatusDescription(
    dataPoint: WeatherStormWaterDataPoint,
  ): string {
    return sensorViewModel.getSensorStatusDescription(dataPoint);
  }

  public getSensorStatusBackgroundColor(
    dataPoint: WeatherStormWaterDataPoint,
  ): string {
    return sensorViewModel.getSensorStatusBackgroundColor(dataPoint);
  }

  public getSensorStatusTextColor(
    dataPoint: WeatherStormWaterDataPoint,
  ): string {
    return sensorViewModel.getSensorStatusTextColor(dataPoint);
  }

  public getSensorAlertThresholdSummary(
    dataPoint: WeatherStormWaterDataPoint,
  ): string {
    return sensorViewModel.getSensorAlertThresholdSummary(dataPoint);
  }

  public getSensorUnitLabel(dataPoint: WeatherStormWaterDataPoint): string {
    return sensorViewModel.getSensorUnitLabel(dataPoint);
  }

  public isIntotoStormWaterDataPoint(
    dataPoint: WeatherStormWaterDataPoint,
  ): boolean {
    return sensorViewModel.isIntotoStormWaterDataPoint(dataPoint);
  }

  public hasStormWaterFillLevel(
    dataPoint: WeatherStormWaterDataPoint,
  ): boolean {
    return sensorViewModel.hasStormWaterFillLevel(dataPoint);
  }

  public getDataPointTranslation(type: DataPointType, key: string): string {
    return detailViewModel.getDataPointTranslation(
      type,
      key,
      this.translateService,
    );
  }

  public getDataPointImageUrl(imageUrl: string): string {
    return detailViewModel.getDataPointImageUrl(imageUrl);
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
