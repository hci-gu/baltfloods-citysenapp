import { DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  DataPointType,
  WeatherConditionDataPoint,
} from '@core/models/data-point';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  getDataPointTranslation,
  getMetricUnit,
  getWeatherConditionMetricValue,
} from './data-point-detail-view-model';

@Component({
  selector: 'app-weather-conditions-detail',
  standalone: true,
  imports: [DatePipe, KeyValuePipe, TranslatePipe],
  templateUrl: './weather-conditions-detail.component.html',
  styleUrls: ['./dashboard-data-point-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherConditionsDetailComponent {
  @Input({ required: true }) public dataPoint!: WeatherConditionDataPoint;

  public readonly DATA_POINT_TYPE = DataPointType;

  public constructor(private readonly translateService: TranslateService) {}

  public getDataPointTranslation(type: DataPointType, key: string): string {
    return getDataPointTranslation(type, key, this.translateService);
  }

  public getMetricUnit(type: DataPointType, key: string): string | undefined {
    return getMetricUnit(type, key);
  }

  public getWeatherConditionMetricValue(
    value: string | number,
  ): string | number {
    return getWeatherConditionMetricValue(value, this.translateService);
  }
}
