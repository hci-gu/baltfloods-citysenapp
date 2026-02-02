import { Component, Input } from '@angular/core';
import { NavigationHeaderService } from './navigation-header.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationSidebarComponent } from '@shared/components/navigation/navigation-sidebar/navigation-sidebar.component';
import { IconComponent } from '@shared/components/icon/icon.component';
import { TranslatePipe } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-navigation-header',
  templateUrl: './navigation-header.component.html',
  styleUrls: ['./navigation-header.component.scss'],
  imports: [
    NavigationSidebarComponent,
    IconComponent,
    TranslatePipe,
    RouterLink,
  ],
  standalone: true,
})
export class NavigationHeaderComponent {
  @Input({ required: true }) public title!: string;

  public sidebarOpen = false;
  public showSkip = false;
  public profileLink = '/profile';
  public showProfile = true;

  public constructor(
    public readonly navigationHeaderService: NavigationHeaderService,
    private readonly authService: AuthService,
  ) {
    this.navigationHeaderService.skip$
      .pipe(takeUntilDestroyed())
      .subscribe((showSkip) => (this.showSkip = showSkip));

    this.authService.authState$
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.profileLink = state.token ? '/profile' : '/login';
      });
  }
}
