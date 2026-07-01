import { DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import {
  DataPointType,
  WaterbagTestKitDataPoint,
  WaterbagTestKitDataPointData,
} from '@core/models/data-point';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Chip } from 'primeng/chip';
import {
  getDataPointImageUrl,
  getDataPointTranslation,
  getDataQualityBackgroundColor,
  getDataQualityTextColor,
  getMetricUnit,
  getWaterbagTestkitValue,
} from './data-point-detail-view-model';

@Component({
  selector: 'app-waterbag-testkit-detail',
  standalone: true,
  imports: [Chip, DatePipe, KeyValuePipe, TranslatePipe],
  templateUrl: './waterbag-testkit-detail.component.html',
  styleUrls: ['./dashboard-data-point-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaterbagTestkitDetailComponent {
  @Input({ required: true }) public dataPoint!: WaterbagTestKitDataPoint;

  public readonly DATA_POINT_TYPE = DataPointType;

  public constructor(private readonly translateService: TranslateService) {}

  public getDataPointTranslation(type: DataPointType, key: string): string {
    return getDataPointTranslation(type, key, this.translateService);
  }

  public getWaterbagTestkitValue(
    value: WaterbagTestKitDataPointData,
    key: keyof WaterbagTestKitDataPoint['data'],
  ): number {
    return getWaterbagTestkitValue(value, key, this.translateService);
  }

  public getMetricUnit(type: DataPointType, key: string): string | undefined {
    return getMetricUnit(type, key);
  }

  public getDataQualityBackgroundColor(result: number): string {
    return getDataQualityBackgroundColor(result);
  }

  public getDataQualityTextColor(result: number): string {
    return getDataQualityTextColor(result);
  }

  public getDataPointImageUrl(imageUrl: string): string {
    return getDataPointImageUrl(imageUrl);
  }
}
