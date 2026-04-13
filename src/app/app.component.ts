import { Component, inject, ViewChild, OnInit } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { getCountryCodeFromLanguageCode } from '@shared/utils/i18n-utils';
import { SharedModule } from '@shared/shared.module';
import { GoogleAnalyticsService } from 'ngx-google-analytics';
import { LocationService } from '@core/services/location.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, SharedModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @ViewChild(RouterOutlet) public outlet: RouterOutlet | undefined;

  public title = 'CitySen';

  private readonly googleAnalyticsService: GoogleAnalyticsService = inject(
    GoogleAnalyticsService,
  );
  private readonly locationService = inject(LocationService);
  private readonly route = inject(ActivatedRoute);

  public constructor(private readonly translateService: TranslateService) {
    translateService.use(getCountryCodeFromLanguageCode(navigator.language));
  }

  public get navigationHeaderTitle(): string {
    return this.outlet?.activatedRouteData?.['navigationHeaderTitle'];
  }

  public ngOnInit(): void {
    this.handleQueryLocation();
    this.gaTracked();
  }

  private handleQueryLocation(): void {
    const lat = this.route.snapshot.queryParamMap.get('lat');
    const lon = this.route.snapshot.queryParamMap.get('lon');

    if (lat && lon) {
      this.locationService.setOverriddenLocation([
        parseFloat(lat),
        parseFloat(lon),
      ]);
    }
  }

  private gaTracked(): void {
    if (!sessionStorage.getItem('ga-tracked')) {
      this.googleAnalyticsService.pageView(
        window.location.pathname,
        'CitySen.app',
      );

      sessionStorage.setItem('ga-tracked', 'true');
    }
  }
}
