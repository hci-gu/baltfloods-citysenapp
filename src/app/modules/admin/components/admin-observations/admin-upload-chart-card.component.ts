import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { UploadChart } from './admin-upload-chart';

@Component({
  selector: 'app-admin-upload-chart-card',
  standalone: true,
  templateUrl: './admin-upload-chart-card.component.html',
  styleUrls: ['./admin-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUploadChartCardComponent {
  @Input({ required: true }) public chart!: UploadChart;
}
