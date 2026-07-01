import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  DataPointType,
  WeatherStormWaterDataPoint,
} from '@core/models/data-point';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Chip } from 'primeng/chip';
import {
  getDataPointTranslation,
  getDataQualityBackgroundColor,
  getDataQualityTextColor,
  getMetricUnitForDataPoint,
  getQualityTranslation,
  getStormWaterMetrics,
  getStormWeatherMetricValue,
} from './data-point-detail-view-model';
import {
  getSensorAlertThresholdSummary,
  getSensorStatusBackgroundColor,
  getSensorStatusDescription,
  getSensorStatusLabel,
  getSensorStatusTextColor,
  getSensorUnitLabel,
  getSensorValueLabel,
  hasStormWaterFillLevel,
  isIntotoStormWaterDataPoint,
} from './sensor-threshold-view-model';

@Component({
  selector: 'app-storm-water-detail',
  standalone: true,
  imports: [Chip, DatePipe, TranslatePipe],
  templateUrl: './storm-water-detail.component.html',
  styleUrls: ['./dashboard-data-point-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StormWaterDetailComponent {
  @Input({ required: true }) public dataPoint!: WeatherStormWaterDataPoint;

  public readonly DATA_POINT_TYPE = DataPointType;

  public constructor(
    private readonly translateService: TranslateService,
    private readonly datePipe: DatePipe,
  ) {}

  public isIntotoStormWaterDataPoint(): boolean {
    return isIntotoStormWaterDataPoint(this.dataPoint);
  }

  public getSensorValueLabel(): string {
    return getSensorValueLabel(this.dataPoint);
  }

  public getSensorUnitLabel(): string {
    return getSensorUnitLabel(this.dataPoint);
  }

  public getSensorStatusBackgroundColor(): string {
    return getSensorStatusBackgroundColor(this.dataPoint);
  }

  public getSensorStatusTextColor(): string {
    return getSensorStatusTextColor(this.dataPoint);
  }

  public getSensorStatusLabel(): string {
    return getSensorStatusLabel(this.dataPoint);
  }

  public getSensorStatusDescription(): string {
    return getSensorStatusDescription(this.dataPoint);
  }

  public getSensorAlertThresholdSummary(): string {
    return getSensorAlertThresholdSummary(this.dataPoint);
  }

  public getDataQualityBackgroundColor(): string {
    return getDataQualityBackgroundColor(this.dataPoint.quality);
  }

  public getDataQualityTextColor(): string {
    return getDataQualityTextColor(this.dataPoint.quality);
  }

  public getQualityTranslation(): string {
    return getQualityTranslation(this.dataPoint.quality);
  }

  public hasStormWaterFillLevel(): boolean {
    return hasStormWaterFillLevel(this.dataPoint);
  }

  public getStormWaterMetrics(): { key: string; value: string | number }[] {
    return getStormWaterMetrics(this.dataPoint);
  }

  public getDataPointTranslation(type: DataPointType, key: string): string {
    return getDataPointTranslation(type, key, this.translateService);
  }

  public getStormWeatherMetricValue(
    value: string | number,
    key: string,
  ): string | number {
    return getStormWeatherMetricValue(value, key, this.datePipe);
  }

  public getMetricUnitForDataPoint(key: string): string | undefined {
    return getMetricUnitForDataPoint(this.dataPoint, key);
  }
}
