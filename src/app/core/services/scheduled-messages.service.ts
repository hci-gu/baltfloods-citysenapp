import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { Observable, catchError, of } from 'rxjs';

export interface ScheduledMessage {
  id: string;
  title: string;
  content: string;
  start: string;
  end: string;
}

@Injectable({
  providedIn: 'root',
})
export class ScheduledMessagesService {
  private readonly baseUrl = environment.scheduledMessagesApiUrl;

  public constructor(private readonly http: HttpClient) {}

  public getActiveMessages(): Observable<ScheduledMessage[]> {
    return this.http
      .get<ScheduledMessage[]>(`${this.baseUrl}/active`)
      .pipe(catchError(() => of([])));
  }
}
