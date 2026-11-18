import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ObservationRecord } from '@core/services/observation-records.service';
import { environment } from '@environments/environment';
import { of } from 'rxjs';
import { AdminObservationsComponent } from './admin-observations.component';
import { AdminObservationsStore } from './admin-observations.store';

describe('AdminObservationsComponent image URLs', () => {
  const observations = signal<ObservationRecord[]>([]);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AdminObservationsStore, useValue: { observations } },
        {
          provide: AuthService,
          useValue: { authState$: of({ token: null, record: null }) },
        },
        { provide: Router, useValue: {} },
      ],
    });
  });

  it.each([
    [
      '/api/files/observations/uploaded-1/photo.jpg',
      `${environment.pocketbaseUrl}/files/observations/uploaded-1/photo.jpg`,
    ],
    ['/assets/images/water_overflow.jpg', '/assets/images/water_overflow.jpg'],
    ['', undefined],
  ])('builds a feed with the correct image location for %s', (imageUrl, expected) => {
    observations.set([{ id: 'uploaded-1', type: 'water_overflow', imageUrl }]);
    const component = TestBed.runInInjectionContext(
      () => new AdminObservationsComponent(),
    );

    expect(component.observationFeed()[0].imageUrl).toBe(expected);
  });
});
