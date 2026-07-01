import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { SharedModule } from '@shared/shared.module';
import { PaginatorModule } from 'primeng/paginator';
import { ObservationFeedItem } from './admin-observation-stats';

@Component({
  selector: 'app-admin-observation-list',
  standalone: true,
  imports: [SharedModule, DatePipe, PaginatorModule],
  templateUrl: './admin-observation-list.component.html',
  styleUrls: ['./admin-observations.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminObservationListComponent {
  @Input() public observations: ObservationFeedItem[] = [];
  @Input() public isLoading = false;
  @Input() public errorMessage = '';
  @Input() public totalItems = 0;
  @Input() public pageSize = 50;
  @Input() public currentPage = 1;
  @Input() public canDelete = false;
  @Input() public deletingRecordIds: Set<string> = new Set();
  @Input() public updatingVisibilityRecordIds: Set<string> = new Set();

  @Output() public refresh = new EventEmitter<void>();
  @Output() public pageChange = new EventEmitter<{ page?: number }>();
  @Output() public deleteObservation = new EventEmitter<ObservationFeedItem>();
  @Output() public toggleVisibility = new EventEmitter<ObservationFeedItem>();

  public isDeleting(recordId: string): boolean {
    return this.deletingRecordIds.has(recordId);
  }

  public isVisibilityUpdating(recordId: string): boolean {
    return this.updatingVisibilityRecordIds.has(recordId);
  }
}
