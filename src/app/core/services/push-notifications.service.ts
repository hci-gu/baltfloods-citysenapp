import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { environment } from '@environments/environment';
import { Observable, from, of, throwError } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class PushNotificationsService {
  private readonly baseUrl = environment.pushApiUrl;

  public constructor(
    private readonly swPush: SwPush,
    private readonly http: HttpClient,
  ) {}

  public get isEnabled(): boolean {
    return this.swPush.isEnabled;
  }

  public get permission(): NotificationPermission {
    return Notification.permission;
  }

  public requestSubscription(): Observable<PushSubscription> {
    if (!this.swPush.isEnabled) {
      return throwError(
        () => new Error('Service worker is not enabled for push.'),
      );
    }

    return from(
      this.swPush.requestSubscription({
        serverPublicKey: environment.vapidPublicKey,
      }),
    ).pipe(
      switchMap((subscription) =>
        this.http
          .post<void>(`${this.baseUrl}/subscribe`, subscription)
          .pipe(map(() => subscription)),
      ),
    );
  }

  public unsubscribe(): Observable<void> {
    if (!this.swPush.isEnabled) {
      return of(undefined);
    }

    return from(this.swPush.unsubscribe()).pipe(
      switchMap(() => this.http.post<void>(`${this.baseUrl}/unsubscribe`, {})),
    );
  }

  public readonly messages$ = this.swPush.messages;
  public readonly notificationClicks$ = this.swPush.notificationClicks;
  public readonly subscription$ = this.swPush.subscription;
}
