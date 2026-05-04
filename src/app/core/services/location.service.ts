import { Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LatLong } from '../models/location';
import { BehaviorSubject, catchError, EMPTY, from, Observable } from 'rxjs';

export interface UserLocation {
  loading: boolean;
  location?: LatLong;
}

export type PermissionState = 'prompt' | 'granted' | 'denied';

const OVERRIDDEN_LOCATION_STORAGE_KEY = 'location.override.latLong';

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private _userLocation$ = new BehaviorSubject<UserLocation>({
    loading: true,
  });
  private _requestInProgress = false;
  private _isLocationOverridden = false;

  private _locationPermissionStateSubject$ = new BehaviorSubject<PermissionState>('prompt');
  public locationPermissionState$ = this._locationPermissionStateSubject$.asObservable();

  public constructor() {
    const persistedOverride = this.getPersistedOverriddenLocation();
    if (persistedOverride) {
      this.setOverriddenLocation(persistedOverride);
      return;
    }

    if (navigator.permissions?.query) {
      from(navigator.permissions.query({ name: 'geolocation' }))
        .pipe(
          takeUntilDestroyed(),
          catchError(() => EMPTY),
        )
        .subscribe((permissionStatus) => {
          if (this._isLocationOverridden) {
            return;
          }

          this._locationPermissionStateSubject$.next(permissionStatus.state);
          permissionStatus.onchange = () =>
            !this._isLocationOverridden &&
            this._locationPermissionStateSubject$.next(permissionStatus.state);
        });
    }
  }

  public get userLocation$(): Observable<UserLocation> {
    this.refreshUserLocation();
    return this._userLocation$;
  }

  public get isLocationOverridden(): boolean {
    return this._isLocationOverridden;
  }

  public setOverriddenLocation(latLong: LatLong): void {
    this._isLocationOverridden = true;
    this._requestInProgress = false;
    this._locationPermissionStateSubject$.next('granted');
    this._userLocation$.next({
      loading: false,
      location: latLong,
    });
    this.persistOverriddenLocation(latLong);
  }

  public refreshUserLocation(): void {
    if (this._isLocationOverridden) {
      return;
    }

    if (this._requestInProgress) {
      return;
    }

    if (!navigator.geolocation) {
      this.onGeolocationUnavailable();
      return;
    }

    const { location } = this._userLocation$.value;
    this._requestInProgress = true;
    this._userLocation$.next({
      loading: true,
      ...(location ? { location } : {}),
    });

    navigator.geolocation.getCurrentPosition(
      this.onGetCurrentPositionSuccess.bind(this),
      this.onGetCurrentPositionError.bind(this),
    );
  }

  private onGetCurrentPositionSuccess(position: GeolocationPosition): void {
    this._requestInProgress = false;
    this._locationPermissionStateSubject$.next('granted');
    const { latitude, longitude } = position.coords;
    this._userLocation$.next({
      loading: false,
      location: [latitude, longitude],
    });
  }

  private onGetCurrentPositionError(error: GeolocationPositionError): void {
    this._requestInProgress = false;

    if (error.code === error.PERMISSION_DENIED) {
      this._locationPermissionStateSubject$.next('denied');
    }

    if (this._locationPermissionStateSubject$.value === 'denied') {
      this._userLocation$.next({
        loading: false,
      });
      return;
    }

    this._userLocation$.next({
      loading: false,
      ...(this._userLocation$.value.location
        ? { location: this._userLocation$.value.location }
        : {}),
    });
  }

  private onGeolocationUnavailable(): void {
    this._requestInProgress = false;
    this._locationPermissionStateSubject$.next('denied');
    this._userLocation$.next({
      loading: false,
    });
  }

  private getPersistedOverriddenLocation(): LatLong | null {
    try {
      const storedValue = sessionStorage.getItem(OVERRIDDEN_LOCATION_STORAGE_KEY);
      if (!storedValue) {
        return null;
      }

      const parsed = JSON.parse(storedValue);
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        !parsed.every((value) => typeof value === 'number' && Number.isFinite(value))
      ) {
        return null;
      }

      return [parsed[0], parsed[1]];
    } catch {
      return null;
    }
  }

  private persistOverriddenLocation(latLong: LatLong): void {
    try {
      sessionStorage.setItem(
        OVERRIDDEN_LOCATION_STORAGE_KEY,
        JSON.stringify(latLong),
      );
    } catch {
      // Ignore storage failures and keep the in-memory override active.
    }
  }
}
