import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '@core/services/auth.service';
import {
  ObservationRecord,
  ObservationRecordsPage,
  ObservationRecordsService,
} from '@core/services/observation-records.service';
import { ObservationRealtimeService } from '@core/services/observation-realtime.service';
import { debounceTime, forkJoin, interval, startWith, switchMap } from 'rxjs';
import { ObservationFeedItem } from './admin-observation-stats';

@Injectable()
export class AdminObservationsStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly observationRecordsService = inject(
    ObservationRecordsService,
  );
  private readonly observationRealtimeService = inject(
    ObservationRealtimeService,
  );
  private readonly authService = inject(AuthService);

  private _observations = signal<ObservationRecord[]>([]);
  private _recentObservations = signal<ObservationRecord[]>([]);
  private _latestObservation = signal<ObservationRecord | null>(null);

  public readonly observations = this._observations.asReadonly();
  public readonly recentObservations = this._recentObservations.asReadonly();
  public readonly latestObservation = this._latestObservation.asReadonly();
  public readonly chartDays = 30;
  public readonly pageSize = 50;
  public readonly isLoading = signal<boolean>(true);
  public readonly errorMessage = signal<string>('');
  public readonly currentPage = signal<number>(1);
  public readonly totalItems = signal<number>(0);
  public readonly deletingRecordIds = signal<Set<string>>(new Set());
  public readonly updatingVisibilityRecordIds = signal<Set<string>>(new Set());

  public constructor() {
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
        switchMap(() => this.fetchInsights()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ recent, latest }) => this.applyInsights(recent, latest),
      });

    this.observationRealtimeService.observationChanges$
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadObservationPage(this.currentPage());
        this.loadInsights();
      });
  }

  public refresh(): void {
    this.loadObservationPage(this.currentPage(), true);
    this.loadInsights();
  }

  public onPageChange(event: { page?: number }): void {
    const nextPage = (event.page ?? 0) + 1;
    if (nextPage === this.currentPage()) {
      return;
    }

    this.currentPage.set(nextPage);
    this.loadObservationPage(nextPage, true);
  }

  public isDeleting(recordId: string): boolean {
    return this.deletingRecordIds().has(recordId);
  }

  public isVisibilityUpdating(recordId: string): boolean {
    return this.updatingVisibilityRecordIds().has(recordId);
  }

  public deleteObservation(item: ObservationFeedItem): void {
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
    this.fetchInsights().subscribe({
      next: ({ recent, latest }) => this.applyInsights(recent, latest),
    });
  }

  private fetchInsights() {
    return forkJoin({
      recent: this.observationRecordsService.listRecentObservations(
        this.chartDays,
      ),
      latest: this.observationRecordsService.listObservations(1, 1),
    });
  }

  private applyInsights(
    recent: ObservationRecord[],
    latest: ObservationRecordsPage,
  ): void {
    this._recentObservations.set(recent);
    this._latestObservation.set(latest.items[0] ?? null);
  }

  private applyObservationPage(page: ObservationRecordsPage): void {
    this._observations.set(page.items);
    this.currentPage.set(page.page > 0 ? page.page : 1);
    this.totalItems.set(Math.max(0, page.totalItems));
    this.isLoading.set(false);
    this.errorMessage.set('');
  }

  private handleLoadError(_error: HttpErrorResponse): void {
    this.isLoading.set(false);
    this.errorMessage.set('Failed to load observations.');
  }
}
