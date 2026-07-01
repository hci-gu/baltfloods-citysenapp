import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AdminAlertPanelComponent } from './admin-alert-panel.component';
import { AdminStats } from './admin-observation-stats';

@Component({
  selector: 'app-admin-summary-card',
  standalone: true,
  imports: [DatePipe, AdminAlertPanelComponent],
  templateUrl: './admin-summary-card.component.html',
  styleUrls: ['./admin-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSummaryCardComponent {
  @Input({ required: true }) public stats!: AdminStats;
  @Input() public canManageObservations = false;
}
