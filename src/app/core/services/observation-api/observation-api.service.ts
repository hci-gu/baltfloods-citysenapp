import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LatLong } from '@core/models/location';
import { environment } from '@environments/environment';

export type ObservationType = 'water_system' | 'stormwater';
export type AlgaeLevel = 'none' | 'little' | 'rich' | 'very_rich';

export interface WaterObservationPayload {
  location: LatLong;
  observationType: ObservationType;
  photo: File | null;
  airTemp: number | null;
  waterTemp: number | null;
  depthOfView: number | null;
  algaeLevel: AlgaeLevel | null;
  waterPh: number | null;
  turbidity: number | null;
  dissolvedOxygen: number | null;
  nitrate: number | null;
  phosphate: number | null;
  identificationCode: string;
  termsAccepted: boolean;
  cc0Accepted: boolean;
}

export interface WaterObservationResponse {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class ObservationApiService {
  private baseUrl = environment.observationApiUrl;

  public constructor(private readonly httpClient: HttpClient) {}

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

    formData.append('identificationCode', payload.identificationCode);
    formData.append('termsAccepted', String(payload.termsAccepted));
    formData.append('cc0Accepted', String(payload.cc0Accepted));

    return this.httpClient.post<WaterObservationResponse>(
      `${this.baseUrl}/water`,
      formData,
    );
  }

  private appendOptionalNumber(
    formData: FormData,
    key: string,
    value: number | null,
  ): void {
    if (value === null || value === undefined) {
      return;
    }

    formData.append(key, value.toString());
  }
}
