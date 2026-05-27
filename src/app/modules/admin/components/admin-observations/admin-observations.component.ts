import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DemoTimeService } from '@core/services/demo-time.service';
import {
  ObservationRecord,
  ObservationRecordsPage,
  ObservationRecordsService,
} from '@core/services/observation-records.service';
import { ObservationRealtimeService } from '@core/services/observation-realtime.service';
import {
  DashboardMessageType,
  ScheduledMessagesService,
} from '@core/services/scheduled-messages.service';
import { AuthService } from '@core/services/auth.service';
import { environment } from '@environments/environment';
import { Router } from '@angular/router';
import {
  debounceTime,
  forkJoin,
  interval,
  Observable,
  of,
  startWith,
  switchMap,
  take,
} from 'rxjs';
import { SharedModule } from '@shared/shared.module';
import { PaginatorModule } from 'primeng/paginator';

interface ObservationFeedItem {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  createdOn?: Date;
  imageUrl?: string;
}

interface TypeCountItem {
  type: string;
  count: number;
}

interface AdminStats {
  totalUploads: number;
  uploadsToday: number;
  latestUpload: {
    id: string;
    type: string;
    timestamp: Date;
  } | null;
  typeBreakdownToday: TypeCountItem[];
}

interface UploadChartPoint {
  x: number;
  y: number;
  count: number;
  label: string;
  markerPath: string;
}

interface UploadChartTick {
  y: number;
  label: number;
}

interface UploadChart {
  points: UploadChartPoint[];
  linePath: string;
  areaPath: string;
  ticks: UploadChartTick[];
  startLabel: string;
  endLabel: string;
  totalPeriodUploads: number;
}

const DEMO_START_TIME_INPUT = '2026-02-14T12:00';
const DEMO_TRIGGER_ALARM_TIME_INPUT = '2026-02-15T20:00';
const DEMO_BACK_TO_NORMAL_TIME_INPUT = '2026-02-16T12:00';

@Component({
  selector: 'app-admin-observations',
  standalone: true,
  templateUrl: './admin-observations.component.html',
  styleUrls: ['./admin-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule, DatePipe, PaginatorModule],
})
export class AdminObservationsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private _observations = signal<ObservationRecord[]>([]);
  private _recentObservations = signal<ObservationRecord[]>([]);
  private _latestObservation = signal<ObservationRecord | null>(null);
  private readonly chartDays = 30;
  private readonly chartPaddingTop = 6;
  private readonly chartPaddingBottom = 6;
  private readonly chartPaddingHorizontal = 2;
  public readonly pageSize = 50;
  private readonly demoTimeOverride = toSignal(this.demoTimeService.override$, {
    initialValue: null,
  });
  private authState = toSignal(this.authService.authState$, {
    initialValue: { token: null, record: null },
  });

  public isLoading = signal<boolean>(true);
  public errorMessage = signal<string>('');
  public demoTimeError = signal<string>('');
  public demoTimeInput = signal<string>('');
  public isSavingDemoTime = signal<boolean>(false);
  public alertTitleInput = signal<string>('');
  public alertMessageInput = signal<string>('');
  public alertTypeInput = signal<DashboardMessageType>('info');
  public alertDurationHoursInput = signal<string>('2');
  public alertError = signal<string>('');
  public alertSuccess = signal<string>('');
  public isSendingAlert = signal<boolean>(false);
  public currentPage = signal<number>(1);
  public totalItems = signal<number>(0);
  public deletingRecordIds = signal<Set<string>>(new Set());
  public updatingVisibilityRecordIds = signal<Set<string>>(new Set());
  public isAuthenticated = computed(() => !!this.authState().token);
  public isAdminUser = computed(
    () => this.authState().record?.type === 'admin',
  );
  public canManageObservations = computed(
    () => this.isAuthenticated() && this.isAdminUser(),
  );
  public canDelete = this.canManageObservations;
  public effectiveDemoTime = computed(
    () => this.demoTimeOverride() ?? this.demoTimeService.now(),
  );
  public hasDemoTimeOverride = computed(() => !!this.demoTimeOverride());

  public observationFeed = computed<ObservationFeedItem[]>(() =>
    this._observations()
      .slice()
      .sort(
        (a, b) =>
          this.getCreatedTimestamp(b).getTime() -
          this.getCreatedTimestamp(a).getTime(),
      )
      .map((observation) => ({
        id: observation.id,
        name: observation.name?.trim() || observation.id,
        type: this.getObservationTypeLabel(observation),
        visible: observation.visible ?? false,
        createdOn: this.getCreatedTimestamp(observation),
        imageUrl: this.getObservationImageUrl(observation),
      })),
  );
  public stats = computed<AdminStats>(() => {
    const recentObservations = this._recentObservations();
    const todayStart = this.getDayStart(new Date());

    const todayItems = recentObservations.filter(
      (observation) =>
        this.getCreatedTimestamp(observation).getTime() >= todayStart.getTime(),
    );
    const latestUpload = this._latestObservation();

    return {
      totalUploads: this.totalItems(),
      uploadsToday: todayItems.length,
      latestUpload: latestUpload
        ? {
            id: latestUpload.id,
            type: this.getObservationTypeLabel(latestUpload),
            timestamp: this.getCreatedTimestamp(latestUpload),
          }
        : null,
      typeBreakdownToday: this.toTypeBreakdown(todayItems),
    };
  });
  public uploadChart = computed<UploadChart>(() => {
    const observations = this._recentObservations();
    const today = this.getDayStart(new Date());
    const dayEntries = Array.from({ length: this.chartDays }, (_, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (this.chartDays - 1 - index));
      return {
        day,
        key: this.dayKey(day),
        count: 0,
      };
    });
    const dayMap = new Map(dayEntries.map((entry) => [entry.key, entry]));
    const leftX = this.chartPaddingHorizontal;
    const rightX = 100 - this.chartPaddingHorizontal;
    const topY = this.chartPaddingTop;
    const bottomY = 100 - this.chartPaddingBottom;
    const plotWidth = rightX - leftX;
    const plotHeight = bottomY - topY;

    observations.forEach((observation) => {
      const key = this.dayKey(this.getCreatedTimestamp(observation));
      const entry = dayMap.get(key);
      if (entry) {
        entry.count += 1;
      }
    });

    const counts = dayEntries.map((entry) => entry.count);
    const maxCount = Math.max(1, ...counts);
    const totalPeriodUploads = counts.reduce((sum, value) => sum + value, 0);
    const points = dayEntries.map((entry, index) => {
      const progress =
        dayEntries.length > 1 ? index / (dayEntries.length - 1) : 0;
      const x = leftX + progress * plotWidth;
      const y = bottomY - (entry.count / maxCount) * plotHeight;

      return {
        x,
        y,
        count: entry.count,
        label: `${entry.day.toLocaleDateString()} (${entry.count})`,
        markerPath: `M ${x.toFixed(2)} ${y.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`,
      };
    });

    const linePath = points
      .map(
        (point, index) =>
          `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
      )
      .join(' ');

    const areaPath = points.length
      ? `M ${points[0].x.toFixed(2)} ${bottomY.toFixed(2)} ${points
          .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join(
            ' ',
          )} L ${points[points.length - 1].x.toFixed(2)} ${bottomY.toFixed(2)} Z`
      : '';

    const ticks: UploadChartTick[] = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: bottomY - ratio * plotHeight,
      label: Math.round(maxCount * ratio),
    }));

    return {
      points,
      linePath,
      areaPath,
      ticks,
      startLabel: dayEntries[0].day.toLocaleDateString(),
      endLabel: dayEntries[dayEntries.length - 1].day.toLocaleDateString(),
      totalPeriodUploads,
    };
  });

  public constructor(
    private readonly demoTimeService: DemoTimeService,
    private readonly observationRecordsService: ObservationRecordsService,
    private readonly observationRealtimeService: ObservationRealtimeService,
    private readonly scheduledMessagesService: ScheduledMessagesService,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    effect(() => {
      const override = this.demoTimeOverride();
      this.demoTimeInput.set(
        this.formatDateTimeInput(override ?? this.demoTimeService.now()),
      );
    });

    interval(15000)
      .pipe(
        startWith(0),
        switchMap(() =>
          this.observationRecordsService.listObservations(
            this.currentPage(),
            this.pageSize,
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => this.applyObservationPage(page),
        error: (error: HttpErrorResponse) => this.handleLoadError(error),
      });

    interval(15000)
      .pipe(
        startWith(0),
        switchMap(() =>
          forkJoin({
            recent: this.observationRecordsService.listRecentObservations(
              this.chartDays,
            ),
            latest: this.observationRecordsService.listObservations(1, 1),
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ recent, latest }) => {
          this._recentObservations.set(recent);
          this._latestObservation.set(latest.items[0] ?? null);
        },
      });

    this.observationRealtimeService.observationChanges$
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadObservationPage(this.currentPage());
        this.loadInsights();
      });

    this.demoTimeService.overrideChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadInsights();
      });
  }

  public refresh(): void {
    this.loadObservationPage(this.currentPage(), true);
    this.loadInsights();
  }

  public onDemoTimeInputChange(value: string): void {
    this.demoTimeInput.set(value);
  }

  public useDeviceTimeAsFakeTime(): void {
    this.demoTimeInput.set(this.formatDateTimeInput(new Date()));
  }

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
    if (!this.canManageObservations()) {
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

  public setDemoStartTime(): void {
    this.applyDemoTimePreset(DEMO_START_TIME_INPUT);
  }

  public triggerDemoAlarm(): void {
    this.applyDemoTimePreset(DEMO_TRIGGER_ALARM_TIME_INPUT);
  }

  public setDemoBackToNormalTime(): void {
    this.demoTimeInput.set(DEMO_BACK_TO_NORMAL_TIME_INPUT);
    this.saveDemoTimeOverrideAndHideDemoObservations();
  }

  public saveDemoTimeOverride(): void {
    if (!this.canManageObservations()) {
      this.demoTimeError.set('Sign in as an admin to update demo time.');
      return;
    }

    const parsed = this.parseDateTimeInput(this.demoTimeInput());
    if (!parsed) {
      this.demoTimeError.set('Enter a valid date and time.');
      return;
    }

    this.demoTimeError.set('');
    this.isSavingDemoTime.set(true);
    this.demoTimeService
      .setOverride(parsed)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isSavingDemoTime.set(false);
        },
        error: () => {
          this.isSavingDemoTime.set(false);
          this.demoTimeError.set(
            'Failed to update demo time. Please try again.',
          );
        },
      });
  }

  public clearDemoTimeOverride(): void {
    if (!this.canManageObservations()) {
      this.demoTimeError.set('Sign in as an admin to update demo time.');
      return;
    }

    this.demoTimeError.set('');
    this.isSavingDemoTime.set(true);
    this.demoTimeService
      .setOverride(null)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isSavingDemoTime.set(false);
        },
        error: () => {
          this.isSavingDemoTime.set(false);
          this.demoTimeError.set(
            'Failed to clear demo time. Please try again.',
          );
        },
      });
  }

  private applyDemoTimePreset(value: string): void {
    this.demoTimeInput.set(value);
    this.saveDemoTimeOverride();
  }

  private saveDemoTimeOverrideAndHideDemoObservations(): void {
    if (!this.canManageObservations()) {
      this.demoTimeError.set('Sign in as an admin to update demo time.');
      return;
    }

    const parsed = this.parseDateTimeInput(this.demoTimeInput());
    const token = this.authService.token;
    if (!parsed) {
      this.demoTimeError.set('Enter a valid date and time.');
      return;
    }

    if (!token) {
      this.demoTimeError.set('Sign in as an admin to update observations.');
      return;
    }

    this.demoTimeError.set('');
    this.isSavingDemoTime.set(true);
    forkJoin({
      override: this.demoTimeService.setOverride(parsed),
      hiddenObservations: this.hideDemoWindowObservations(token),
    })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.isSavingDemoTime.set(false);
          this.loadObservationPage(this.currentPage());
          this.loadInsights();
        },
        error: () => {
          this.isSavingDemoTime.set(false);
          this.demoTimeError.set(
            'Failed to reset demo state. Please try again.',
          );
        },
      });
  }

  private hideDemoWindowObservations(
    authToken: string,
  ): Observable<ObservationRecord[]> {
    const start = this.parseDateTimeInput(DEMO_START_TIME_INPUT);
    const end = this.parseDateTimeInput(DEMO_BACK_TO_NORMAL_TIME_INPUT);
    if (!start || !end) {
      return of([]);
    }

    return this.observationRecordsService
      .listObservationsByDisplayTimeRange(start, end)
      .pipe(
        switchMap((records) => {
          const recordsToHide = records.filter(
            (record) => record.visible !== false,
          );

          if (recordsToHide.length === 0) {
            return of([]);
          }

          return forkJoin(
            recordsToHide.map((record) =>
              this.observationRecordsService.updateObservation(
                record.id,
                { visible: false },
                authToken,
              ),
            ),
          );
        }),
      );
  }

  public onPageChange(event: { page?: number }): void {
    const nextPage = (event.page ?? 0) + 1;
    if (nextPage === this.currentPage()) {
      return;
    }

    this.currentPage.set(nextPage);
    this.loadObservationPage(nextPage, true);
  }

  public logout(): void {
    this.authService.logout();
  }

  public goToLogin(): void {
    void this.router.navigate(['/login'], {
      queryParams: { redirectTo: '/dashboard' },
    });
  }

  public isDeleting(recordId: string): boolean {
    return this.deletingRecordIds().has(recordId);
  }

  public isVisibilityUpdating(recordId: string): boolean {
    return this.updatingVisibilityRecordIds().has(recordId);
  }

  public deleteObservation(item: ObservationFeedItem): void {
    if (!this.canDelete()) {
      return;
    }

    const token = this.authService.token;
    if (!token) {
      this.errorMessage.set('Sign in as an admin to delete observations.');
      return;
    }

    const recordId = item.id;

    if (!confirm(`Delete observation ${recordId}?`)) {
      return;
    }

    this.errorMessage.set('');
    this.deletingRecordIds.update((current) => {
      const next = new Set(current);
      next.add(recordId);
      return next;
    });

    this.observationRecordsService
      .deleteObservation(recordId, token)
      .subscribe({
        next: () => {
          this.removeDeletingRecordId(recordId);
          const remaining = this._observations().filter(
            (observation) => observation.id !== recordId,
          );
          this._observations.set(remaining);
          this.totalItems.update((total) => Math.max(0, total - 1));

          if (remaining.length === 0 && this.currentPage() > 1) {
            const previousPage = this.currentPage() - 1;
            this.currentPage.set(previousPage);
            this.loadObservationPage(previousPage);
            this.loadInsights();
            return;
          }

          this.loadObservationPage(this.currentPage());
          this.loadInsights();
        },
        error: (error: HttpErrorResponse) => {
          this.removeDeletingRecordId(recordId);
          if (error.status === 401 || error.status === 403) {
            this.errorMessage.set(
              'Only authenticated admin users can delete observations.',
            );
            return;
          }
          this.errorMessage.set(
            'Failed to delete observation. Please try again.',
          );
        },
      });
  }

  public toggleVisibility(item: ObservationFeedItem): void {
    if (!this.canManageObservations()) {
      return;
    }

    const token = this.authService.token;
    if (!token) {
      this.errorMessage.set('Sign in as an admin to update observations.');
      return;
    }

    const nextVisible = !item.visible;
    this.errorMessage.set('');
    this.updatingVisibilityRecordIds.update((current) => {
      const next = new Set(current);
      next.add(item.id);
      return next;
    });

    this.observationRecordsService
      .updateObservation(item.id, { visible: nextVisible }, token)
      .subscribe({
        next: () => {
          this.removeVisibilityUpdatingRecordId(item.id);
          this._observations.update((records) =>
            records.map((record) =>
              record.id === item.id
                ? { ...record, visible: nextVisible }
                : record,
            ),
          );
          this.loadObservationPage(this.currentPage());
          this.loadInsights();
        },
        error: (error: HttpErrorResponse) => {
          this.removeVisibilityUpdatingRecordId(item.id);
          if (error.status === 401 || error.status === 403) {
            this.errorMessage.set(
              'Only authenticated admin users can update observations.',
            );
            return;
          }
          this.errorMessage.set(
            'Failed to update observation visibility. Please try again.',
          );
        },
      });
  }

  public getObservationTypeLabel(observation: ObservationRecord): string {
    const recordType = observation.type ?? '';
    const observationType = observation.data?.['observationType'];

    if (recordType === 'storm_water') {
      return 'Storm water';
    }

    if (recordType === 'waterbag_testkit') {
      if (observationType === 'stormwater') {
        return 'Storm water';
      }
      if (observationType === 'water_system') {
        return 'Water system';
      }
      return 'Water observations';
    }

    if (recordType === 'water_overflow') {
      return 'Water overflow';
    }

    return recordType || 'Observation';
  }

  private removeDeletingRecordId(recordId: string): void {
    this.deletingRecordIds.update((current) => {
      const next = new Set(current);
      next.delete(recordId);
      return next;
    });
  }

  private removeVisibilityUpdatingRecordId(recordId: string): void {
    this.updatingVisibilityRecordIds.update((current) => {
      const next = new Set(current);
      next.delete(recordId);
      return next;
    });
  }

  private loadObservationPage(page: number, showLoading = false): void {
    if (showLoading) {
      this.isLoading.set(true);
    }

    this.observationRecordsService
      .listObservations(page, this.pageSize)
      .subscribe({
        next: (responsePage) => this.applyObservationPage(responsePage),
        error: (error: HttpErrorResponse) => this.handleLoadError(error),
      });
  }

  private loadInsights(): void {
    forkJoin({
      recent: this.observationRecordsService.listRecentObservations(
        this.chartDays,
      ),
      latest: this.observationRecordsService.listObservations(1, 1),
    }).subscribe({
      next: ({ recent, latest }) => {
        this._recentObservations.set(recent);
        this._latestObservation.set(latest.items[0] ?? null);
      },
    });
  }

  private applyObservationPage(page: ObservationRecordsPage): void {
    this._observations.set(page.items);
    this.currentPage.set(page.page > 0 ? page.page : 1);
    this.totalItems.set(Math.max(0, page.totalItems));
    this.isLoading.set(false);
    this.errorMessage.set('');
  }

  private getObservationImageUrl(
    observation: ObservationRecord,
  ): string | undefined {
    if (!observation.imageUrl || !observation.imageUrl.trim()) {
      return undefined;
    }

    return this.normalizeImageUrl(observation.imageUrl);
  }

  private getTimestamp(observation: ObservationRecord): Date {
    const raw = observation.dataRetrievedTimestamp;
    if (typeof raw === 'number') {
      return new Date(raw * 1000);
    }
    if (typeof raw === 'string') {
      const numeric = Number(raw);
      if (!Number.isNaN(numeric)) {
        return new Date(numeric * 1000);
      }
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (observation.created) {
      const parsed = new Date(observation.created);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date(0);
  }

  private getCreatedTimestamp(observation: ObservationRecord): Date {
    if (observation.created) {
      const parsed = new Date(observation.created);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return this.getTimestamp(observation);
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

  private handleLoadError(error: HttpErrorResponse): void {
    this.isLoading.set(false);
    this.errorMessage.set('Failed to load observations.');
  }

  private normalizeImageUrl(imageUrl: string): string {
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

  private toTypeBreakdown(observations: ObservationRecord[]): TypeCountItem[] {
    const counts = new Map<string, number>();

    observations.forEach((observation) => {
      const type = this.getObservationTypeLabel(observation);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  private dayKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDayStart(date: Date): Date {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    return dayStart;
  }

  private formatDateTimeInput(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private parseDateTimeInput(value: string): Date | null {
    if (!value.trim()) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
