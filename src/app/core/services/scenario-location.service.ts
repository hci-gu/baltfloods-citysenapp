import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { LatLong } from '@core/models/location';

/** A scenario belongs to this page session, never to the device's GPS state. */
@Injectable({ providedIn: 'root' })
export class ScenarioLocationService {
  public readonly location: LatLong | null = this.readLocation();

  public get queryParams(): { lat: number; lon: number } | null {
    return this.location
      ? { lat: this.location[0], lon: this.location[1] }
      : null;
  }

  private readLocation(): LatLong | null {
    const query = new URLSearchParams(inject(DOCUMENT).location.search);
    const latitude = query.get('lat')?.trim();
    const longitude = query.get('lon')?.trim();

    if (!latitude || !longitude) {
      return null;
    }

    const lat = Number(latitude);
    const lon = Number(longitude);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      return null;
    }

    return [lat, lon];
  }
}
