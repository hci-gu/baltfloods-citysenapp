import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ObservationRecord,
  SuperuserAuthService,
} from '@core/services/superuser-auth.service';
import { environment } from '@environments/environment';
import { Router } from '@angular/router';
import { interval, startWith, switchMap } from 'rxjs';
import { SharedModule } from '@shared/shared.module';

interface ObservationFeedItem {
  id: string;
  name: string;
  type: string;
  lastUpdatedOn?: Date;
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

@Component({
  selector: 'app-admin-observations',
  standalone: true,
  templateUrl: './admin-observations.component.html',
  styleUrls: ['./admin-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedModule, DatePipe],
})
export class AdminObservationsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private _observations = signal<ObservationRecord[]>([]);
  private readonly chartDays = 30;

  public isLoading = signal<boolean>(true);
  public errorMessage = signal<string>('');
  public deletingRecordIds = signal<Set<string>>(new Set());

  public observationFeed = computed<ObservationFeedItem[]>(() =>
    this._observations()
      .slice()
      .sort(
        (a, b) =>
          this.getTimestamp(b).getTime() - this.getTimestamp(a).getTime(),
      )
      .map((observation) => ({
        id: observation.id,
        name: observation.id,
        type: this.getObservationTypeLabel(observation),
        lastUpdatedOn: this.getTimestamp(observation),
        imageUrl: this.getObservationImageUrl(observation),
      })),
  );
  public stats = computed<AdminStats>(() => {
    const observations = this._observations();
    const todayStart = this.getDayStart(new Date());

    const todayItems = observations.filter(
      (observation) => this.getTimestamp(observation).getTime() >= todayStart.getTime(),
    );

    const latestUpload = observations
      .slice()
      .sort(
        (a, b) => this.getTimestamp(b).getTime() - this.getTimestamp(a).getTime(),
      )[0];

    return {
      totalUploads: observations.length,
      uploadsToday: todayItems.length,
      latestUpload: latestUpload
        ? {
            id: latestUpload.id,
            type: this.getObservationTypeLabel(latestUpload),
            timestamp: this.getTimestamp(latestUpload),
          }
        : null,
      typeBreakdownToday: this.toTypeBreakdown(todayItems),
    };
  });
  public uploadChart = computed<UploadChart>(() => {
    const observations = this._observations();
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

    observations.forEach((observation) => {
      const key = this.dayKey(this.getTimestamp(observation));
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
      const x = progress * 100;
      const y = 100 - (entry.count / maxCount) * 100;

      return {
        x,
        y,
        count: entry.count,
        label: `${entry.day.toLocaleDateString()} (${entry.count})`,
      };
    });

    const linePath = points
      .map((point, index) =>
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
      )
      .join(' ');

    const areaPath = points.length
      ? `M ${points[0].x.toFixed(2)} 100 ${points
          .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join(' ')} L ${points[points.length - 1].x.toFixed(2)} 100 Z`
      : '';

    const ticks: UploadChartTick[] = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: 100 - ratio * 100,
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
    private readonly superuserAuthService: SuperuserAuthService,
    private readonly router: Router,
  ) {
    interval(15000)
      .pipe(
        startWith(0),
        switchMap(() => this.superuserAuthService.listObservations()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (records) => {
          this._observations.set(records);
          this.isLoading.set(false);
          this.errorMessage.set('');
        },
        error: (error: HttpErrorResponse) => this.handleLoadError(error),
      });
  }

  public refresh(): void {
    this.isLoading.set(true);
    this.superuserAuthService.listObservations().subscribe({
      next: (records) => {
        this._observations.set(records);
        this.isLoading.set(false);
        this.errorMessage.set('');
      },
      error: (error: HttpErrorResponse) => this.handleLoadError(error),
    });
  }

  public logout(): void {
    this.superuserAuthService.logout();
    void this.router.navigate(['/admin/login']);
  }

  public isDeleting(recordId: string): boolean {
    return this.deletingRecordIds().has(recordId);
  }

  public deleteObservation(item: ObservationFeedItem): void {
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

    this.superuserAuthService.deleteObservation(recordId).subscribe({
      next: () => {
        this._observations.update((current) =>
          current.filter((observation) => observation.id !== recordId),
        );
        this.removeDeletingRecordId(recordId);
      },
      error: (error: HttpErrorResponse) => {
        this.removeDeletingRecordId(recordId);
        if (error.status === 401 || error.status === 403) {
          this.logout();
          return;
        }
        this.errorMessage.set('Failed to delete observation. Please try again.');
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
      return 'Water observations';
    }

    if (recordType === 'water_observation') {
      switch (observationType) {
      case 'water_system':
        return 'Water system';
      case 'stormwater':
        return 'Storm water';
      case 'water_overflow':
        return 'Water overflow';
      default:
        return 'Water observation';
      }
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

  private getObservationImageUrl(
    observation: ObservationRecord,
  ): string | undefined {
    if (observation.imageUrl && observation.imageUrl.trim()) {
      return this.normalizeImageUrl(observation.imageUrl);
    }

    const photo = observation.photo;
    const filename = Array.isArray(photo)
      ? photo.find((item) => typeof item === 'string' && item.length > 0)
      : typeof photo === 'string'
        ? photo
        : undefined;

    if (!filename) {
      return undefined;
    }

    return `${environment.pocketbaseUrl}/files/observations/${observation.id}/${encodeURIComponent(filename)}`;
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

  private handleLoadError(error: HttpErrorResponse): void {
    this.isLoading.set(false);
    const message =
      typeof error.error === 'string'
        ? error.error
        : typeof error.error?.message === 'string'
          ? error.error.message
          : '';

    if (
      error.status === 401 ||
      error.status === 403 ||
      (error.status === 400 && message.includes('token is malformed'))
    ) {
      this.logout();
      return;
    }
    this.errorMessage.set('Failed to load observations.');
  }

  private normalizeImageUrl(imageUrl: string): string {
    const trimmed = imageUrl.trim();

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    if (trimmed.startsWith('/')) {
      return trimmed;
    }

    if (trimmed.startsWith('../')) {
      return `/${trimmed.replace(/^(\.\.\/)+/, '')}`;
    }

    return `${environment.streetAiUploadUrl.replace(/\/$/, '')}/${trimmed.replace(/^\/+/, '')}`;
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
}
