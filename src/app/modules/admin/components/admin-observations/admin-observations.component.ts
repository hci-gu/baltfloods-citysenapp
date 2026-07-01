import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ObservationRecord } from '@core/services/observation-records.service';
import { environment } from '@environments/environment';
import { AdminObservationListComponent } from './admin-observation-list.component';
import {
  AdminStats,
  ObservationFeedItem,
  buildAdminStats,
  buildObservationFeed,
} from './admin-observation-stats';
import { AdminObservationsStore } from './admin-observations.store';
import { AdminSummaryCardComponent } from './admin-summary-card.component';
import { UploadChart, buildUploadChart } from './admin-upload-chart';
import { AdminUploadChartCardComponent } from './admin-upload-chart-card.component';

@Component({
  selector: 'app-admin-observations',
  standalone: true,
  templateUrl: './admin-observations.component.html',
  styleUrls: ['./admin-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminSummaryCardComponent,
    AdminUploadChartCardComponent,
    AdminObservationListComponent,
  ],
  providers: [AdminObservationsStore],
})
export class AdminObservationsComponent {
  private readonly store = inject(AdminObservationsStore);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private authState = toSignal(this.authService.authState$, {
    initialValue: { token: null, record: null },
  });

  public readonly pageSize = this.store.pageSize;
  public readonly isLoading = this.store.isLoading;
  public readonly errorMessage = this.store.errorMessage;
  public readonly currentPage = this.store.currentPage;
  public readonly totalItems = this.store.totalItems;
  public readonly deletingRecordIds = this.store.deletingRecordIds;
  public readonly updatingVisibilityRecordIds =
    this.store.updatingVisibilityRecordIds;
  public readonly isAuthenticated = computed(() => !!this.authState().token);
  public readonly isAdminUser = computed(
    () => this.authState().record?.type === 'admin',
  );
  public readonly canManageObservations = computed(
    () => this.isAuthenticated() && this.isAdminUser(),
  );
  public readonly canDelete = this.canManageObservations;

  public readonly observationFeed = computed<ObservationFeedItem[]>(() =>
    buildObservationFeed(this.store.observations(), (observation) =>
      this.getObservationImageUrl(observation),
    ),
  );
  public readonly stats = computed<AdminStats>(() =>
    buildAdminStats(
      this.store.recentObservations(),
      this.store.latestObservation(),
      this.store.totalItems(),
    ),
  );
  public readonly uploadChart = computed<UploadChart>(() =>
    buildUploadChart(this.store.recentObservations(), this.store.chartDays),
  );

  public refresh(): void {
    this.store.refresh();
  }

  public onPageChange(event: { page?: number }): void {
    this.store.onPageChange(event);
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
    return this.store.isDeleting(recordId);
  }

  public isVisibilityUpdating(recordId: string): boolean {
    return this.store.isVisibilityUpdating(recordId);
  }

  public deleteObservation(item: ObservationFeedItem): void {
    if (!this.canDelete()) {
      return;
    }

    this.store.deleteObservation(item);
  }

  public toggleVisibility(item: ObservationFeedItem): void {
    if (!this.canManageObservations()) {
      return;
    }

    this.store.toggleVisibility(item);
  }

  private getObservationImageUrl(
    observation: ObservationRecord,
  ): string | undefined {
    if (!observation.imageUrl || !observation.imageUrl.trim()) {
      return undefined;
    }

    return this.normalizeImageUrl(observation.imageUrl);
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
}
