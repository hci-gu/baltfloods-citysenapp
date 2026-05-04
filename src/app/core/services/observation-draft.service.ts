import { Injectable } from '@angular/core';
import { LatLong } from '@core/models/location';
import { ObservationType } from '@core/services/observation-api/observation-api.service';

export interface QuickObservationDraft {
  location: LatLong;
  observationType: ObservationType;
  photo: File;
}

@Injectable({ providedIn: 'root' })
export class ObservationDraftService {
  private quickObservationDraft: QuickObservationDraft | null = null;

  public setQuickObservationDraft(draft: QuickObservationDraft): void {
    this.quickObservationDraft = draft;
  }

  public consumeQuickObservationDraft(): QuickObservationDraft | null {
    const draft = this.quickObservationDraft;
    this.quickObservationDraft = null;
    return draft;
  }
}
