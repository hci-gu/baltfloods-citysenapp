import { ScheduledMessagesService } from '@core/services/scheduled-messages.service';
import { of, throwError } from 'rxjs';
import { Shallow } from 'shallow-render';
import { AdminAlertPanelComponent } from './admin-alert-panel.component';

describe('AdminAlertPanelComponent', () => {
  let shallow: Shallow<AdminAlertPanelComponent>;

  beforeEach(() => {
    shallow = new Shallow(AdminAlertPanelComponent).mock(
      ScheduledMessagesService,
      {
        createImmediateAlert: jest
          .fn()
          .mockReturnValue(of({ id: 'message-1' })),
      },
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should require admin access before sending a message', async () => {
    const { instance, inject } = await shallow.render();

    instance.sendImmediateAlert();

    expect(instance.alertError()).toBe('Sign in as an admin to send messages.');
    expect(
      inject(ScheduledMessagesService).createImmediateAlert,
    ).not.toHaveBeenCalled();
  });

  it('should validate message content before sending', async () => {
    const { instance, inject } = await shallow.render({
      bind: {
        canManageObservations: true,
      },
    });

    instance.onAlertTitleChange('Flood warning');
    instance.onAlertMessageChange('');
    instance.sendImmediateAlert();

    expect(instance.alertError()).toBe('Enter an alert title and message.');
    expect(
      inject(ScheduledMessagesService).createImmediateAlert,
    ).not.toHaveBeenCalled();
  });

  it('should send escaped immediate alert content', async () => {
    const { instance, inject } = await shallow.render({
      bind: {
        canManageObservations: true,
      },
    });

    instance.onAlertTitleChange('Flood warning');
    instance.onAlertMessageChange('Line <one>\nLine & two');
    instance.onAlertTypeChange('warning');
    instance.onAlertDurationHoursChange('3');
    instance.sendImmediateAlert();

    expect(
      inject(ScheduledMessagesService).createImmediateAlert,
    ).toHaveBeenCalledWith({
      title: 'Flood warning',
      content: '<p>Line &lt;one&gt;<br>Line &amp; two</p>',
      type: 'warning',
      durationHours: 3,
    });
    expect(instance.alertSuccess()).toBe('Message sent.');
    expect(instance.alertTitleInput()).toBe('');
    expect(instance.alertMessageInput()).toBe('');
  });

  it('should show an error when sending fails', async () => {
    const { instance } = await shallow
      .mock(ScheduledMessagesService, {
        createImmediateAlert: jest
          .fn()
          .mockReturnValue(throwError(() => new Error('failed'))),
      })
      .render({
        bind: {
          canManageObservations: true,
        },
      });

    instance.onAlertTitleChange('Flood warning');
    instance.onAlertMessageChange('Stay clear');
    instance.sendImmediateAlert();

    expect(instance.alertError()).toBe(
      'Failed to send message. Please try again.',
    );
    expect(instance.isSendingAlert()).toBe(false);
  });
});
