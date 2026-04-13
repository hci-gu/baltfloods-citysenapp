import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { Observable, catchError, map, of } from 'rxjs';

export type DashboardMessageType = 'info' | 'warning';

export interface DashboardMessage {
  id: string;
  title: string;
  content: string;
  start: string;
  end: string;
  type: DashboardMessageType;
}

export type ScheduledMessage = DashboardMessage;

@Injectable({
  providedIn: 'root',
})
export class ScheduledMessagesService {
  private readonly baseUrl = environment.scheduledMessagesApiUrl;

  public constructor(private readonly http: HttpClient) {}

  public getActiveMessages(): Observable<ScheduledMessage[]> {
    return this.http
      .get<Array<Partial<ScheduledMessage>>>(`${this.baseUrl}/active`)
      .pipe(map((messages) => messages.map(this.normalizeMessage)))
      .pipe(catchError(() => of([])));
  }

  private normalizeMessage(
    message: Partial<ScheduledMessage>,
  ): ScheduledMessage {
    return {
      id: message.id ?? '',
      title: message.title ?? '',
      content: message.content ?? '',
      start: message.start ?? '',
      end: message.end ?? '',
      type: message.type === 'warning' ? 'warning' : 'info',
    };
  }
}
