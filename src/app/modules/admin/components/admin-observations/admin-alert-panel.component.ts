import {
  ChangeDetectionStrategy,
  Component,
  Input,
  signal,
} from '@angular/core';
import {
  DashboardMessageType,
  ScheduledMessagesService,
} from '@core/services/scheduled-messages.service';
import { Button } from 'primeng/button';
import { take } from 'rxjs';

@Component({
  selector: 'app-admin-alert-panel',
  standalone: true,
  imports: [Button],
  templateUrl: './admin-alert-panel.component.html',
  styleUrls: ['./admin-alert-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAlertPanelComponent {
  @Input() public canManageObservations = false;

  public alertTitleInput = signal<string>('');
  public alertMessageInput = signal<string>('');
  public alertTypeInput = signal<DashboardMessageType>('info');
  public alertDurationHoursInput = signal<string>('2');
  public alertError = signal<string>('');
  public alertSuccess = signal<string>('');
  public isSendingAlert = signal<boolean>(false);

  public constructor(
    private readonly scheduledMessagesService: ScheduledMessagesService,
  ) {}

  public onAlertTitleChange(value: string): void {
    this.alertTitleInput.set(value);
  }

  public onAlertMessageChange(value: string): void {
    this.alertMessageInput.set(value);
  }

  public onAlertTypeChange(value: string): void {
    this.alertTypeInput.set(value === 'warning' ? 'warning' : 'info');
  }

  public onAlertDurationHoursChange(value: string): void {
    this.alertDurationHoursInput.set(value);
  }

  public sendImmediateAlert(): void {
    if (!this.canManageObservations) {
      this.alertError.set('Sign in as an admin to send messages.');
      return;
    }

    const title = this.alertTitleInput().trim();
    const message = this.alertMessageInput().trim();
    const durationHours = Number(this.alertDurationHoursInput());
    if (!title || !message) {
      this.alertError.set('Enter an alert title and message.');
      return;
    }

    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      this.alertError.set('Enter a duration greater than 0 hours.');
      return;
    }

    this.alertError.set('');
    this.alertSuccess.set('');
    this.isSendingAlert.set(true);
    this.scheduledMessagesService
      .createImmediateAlert({
        title,
        content: this.formatAlertContent(message),
        type: this.alertTypeInput(),
        durationHours,
      })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isSendingAlert.set(false);
          this.alertSuccess.set('Message sent.');
          this.alertTitleInput.set('');
          this.alertMessageInput.set('');
        },
        error: () => {
          this.isSendingAlert.set(false);
          this.alertError.set('Failed to send message. Please try again.');
        },
      });
  }

  private formatAlertContent(message: string): string {
    const escapedMessage = message
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>');

    return `<p>${escapedMessage}</p>`;
  }
}
