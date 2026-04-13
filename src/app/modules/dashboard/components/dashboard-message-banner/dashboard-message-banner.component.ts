import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  DashboardMessage,
  DashboardMessageType,
} from '@core/services/scheduled-messages.service';
import { IconComponent } from '@shared/components/icon/icon.component';

@Component({
  selector: 'app-dashboard-message-banner',
  templateUrl: './dashboard-message-banner.component.html',
  styleUrls: ['./dashboard-message-banner.component.scss'],
  standalone: true,
  imports: [IconComponent],
})
export class DashboardMessageBannerComponent {
  @Input({ required: true }) public message!: DashboardMessage;
  @Output() public dismiss = new EventEmitter<string>();

  public getMessageTypeLabel(type: DashboardMessageType): string {
    return type === 'warning' ? 'Warning' : 'Info';
  }

  public getMessageIcon(type: DashboardMessageType): string {
    return type === 'warning' ? 'bell' : 'info';
  }

  public onDismiss(): void {
    this.dismiss.emit(this.message.id);
  }
}
