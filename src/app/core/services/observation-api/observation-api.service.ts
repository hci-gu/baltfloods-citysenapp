import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LatLong } from '@core/models/location';
import { environment } from '@environments/environment';
import { AuthService } from '@core/services/auth.service';

export type ObservationType = 'water_system' | 'stormwater' | 'water_overflow';
export type AlgaeLevel = 'none' | 'little' | 'rich' | 'very_rich';

export interface WaterObservationPayload {
  location: LatLong;
  observationType: ObservationType;
  photo: File | null;
  airTemp?: number | null;
  waterTemp?: number | null;
  depthOfView?: number | null;
  algaeLevel?: AlgaeLevel | null;
  waterPh?: number | null;
  turbidity?: number | null;
  dissolvedOxygen?: number | null;
  nitrate?: number | null;
  phosphate?: number | null;
  identificationCode?: string;
  termsAccepted?: boolean;
  cc0Accepted?: boolean;
}

export interface WaterObservationResponse {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class ObservationApiService {
  private baseUrl = environment.observationApiUrl;

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly authService: AuthService,
  ) {}

  public submitWaterObservation(
    payload: WaterObservationPayload,
  ): Observable<WaterObservationResponse> {
    const formData = new FormData();

    formData.append('latitude', payload.location[0].toString());
    formData.append('longitude', payload.location[1].toString());
    formData.append('observationType', payload.observationType);

    if (payload.photo) {
      formData.append('photo', payload.photo);
    }

    this.appendOptionalNumber(formData, 'airTemp', payload.airTemp);
    this.appendOptionalNumber(formData, 'waterTemp', payload.waterTemp);
    this.appendOptionalNumber(formData, 'depthOfView', payload.depthOfView);

    if (payload.algaeLevel) {
      formData.append('algaeLevel', payload.algaeLevel);
    }

    this.appendOptionalNumber(formData, 'waterPh', payload.waterPh);
    this.appendOptionalNumber(formData, 'turbidity', payload.turbidity);
    this.appendOptionalNumber(
      formData,
      'dissolvedOxygen',
      payload.dissolvedOxygen,
    );
    this.appendOptionalNumber(formData, 'nitrate', payload.nitrate);
    this.appendOptionalNumber(formData, 'phosphate', payload.phosphate);

    if (payload.identificationCode) {
      formData.append('identificationCode', payload.identificationCode);
    }
    if (payload.termsAccepted !== undefined) {
      formData.append('termsAccepted', String(payload.termsAccepted));
    }
    if (payload.cc0Accepted !== undefined) {
      formData.append('cc0Accepted', String(payload.cc0Accepted));
    }

    const headers = this.createAuthHeaders();

    return this.httpClient.post<WaterObservationResponse>(
      `${this.baseUrl}/water`,
      formData,
      headers ? { headers } : undefined,
    );
  }

  private createAuthHeaders(): HttpHeaders | null {
    const token = this.authService.token;
    if (!token || !this.looksLikeJwt(token)) {
      return null;
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  private looksLikeJwt(token: string): boolean {
    const parts = token.split('.');
    const jwtPartPattern = /^[A-Za-z0-9_-]+$/;
    return (
      parts.length === 3 &&
      parts.every((part) => part.length > 0 && jwtPartPattern.test(part))
    );
  }

  private appendOptionalNumber(
    formData: FormData,
    key: string,
    value: number | null | undefined,
  ): void {
    if (value === null || value === undefined) {
      return;
    }

    formData.append(key, value.toString());
  }
}
