import { AppSettingsService } from '@core/services/app-settings.service';
import { signal } from '@angular/core';
import { Shallow } from 'shallow-render';
import { AppComponent } from './app.component';
import { RouterModule, RouterOutlet } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NavigationHeaderComponent } from './shared/components/navigation/navigation-header/navigation-header.component';
import { SharedModule } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { GoogleAnalyticsService } from 'ngx-google-analytics';
import { AuthService } from '@core/services/auth.service';
import { of } from 'rxjs';

describe('AppComponent', () => {
  let shallow: Shallow<AppComponent>;

  beforeEach(() => {
    shallow = new Shallow(AppComponent)
      .mock(AppSettingsService, {
        ready: signal(true),
        failed: signal(false),
        loading: signal(false),
        load: jest.fn().mockResolvedValue(undefined),
      })
      .mock(TranslateService, { instant: jest.fn(), use: jest.fn() })
      .mock(GoogleAnalyticsService, { pageView: jest.fn() })
      .mockPipe(TranslatePipe, (input) => `translated ${input}`)
      .provideMock(SharedModule)
      .mock(AuthService, { authState$: of({ token: null, record: null }) });

    jest.spyOn(sessionStorage, 'getItem').mockImplementation((key: string) => {
      const store: Record<string, string> = { myKey: 'mockValue' };
      return store[key] || null;
    });

    jest.spyOn(sessionStorage, 'setItem').mockImplementation(() => {});

    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/mocked-path',
        search: '',
      },
      writable: true,
    });
  });

  it('should render', async () => {
    const component = await shallow.render();

    expect(component).toBeDefined();
  });

  it('does not create the map route before settings load', async () => {
    const { find } = await shallow
      .mock(AppSettingsService, {
        ready: signal(false),
        failed: signal(false),
        loading: signal(true),
      })
      .render();
    expect(find('router-outlet')).toHaveFound(0);
    expect(find('[aria-busy="true"]')).toHaveFoundOne();
  });

  it('offers retry when settings are unavailable', async () => {
    const load = jest.fn().mockResolvedValue(undefined);
    const { find } = await shallow
      .mock(AppSettingsService, {
        ready: signal(false),
        failed: signal(true),
        loading: signal(false),
        load,
      })
      .render();
    expect(find('router-outlet')).toHaveFound(0);
    find('button').triggerEventHandler('click');
    expect(load).toHaveBeenCalledTimes(2);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: window.location,
      writable: false, // Reset to the default behavior
    });
  });

  it('should set the correct navigation header depending on the route', async () => {
    const title = 'Title';

    const { findComponent, instance, fixture } = await shallow
      .replaceModule(RouterModule, RouterTestingModule)
      .render();

    instance.outlet = {
      activatedRouteData: {
        navigationHeaderTitle: title,
      },
    } as any as RouterOutlet;

    fixture.detectChanges();

    expect(findComponent(NavigationHeaderComponent).title).toEqual(
      `translated ${title}`,
    );
  });

  describe('ngOnInit', () => {
    it('should track the page view and set the sessions storage ga-tracked key', async () => {
      const { inject, fixture } = await shallow.render();
      const googleAnalyticsService = inject(GoogleAnalyticsService);

      jest.spyOn(googleAnalyticsService, 'pageView');

      fixture.detectChanges();

      expect(sessionStorage.getItem('ga-tracked')).toBeNull();

      expect(googleAnalyticsService.pageView).toHaveBeenCalledWith(
        '/mocked-path',
        'CitySen.app',
      );
      expect(sessionStorage.setItem).toHaveBeenCalledWith('ga-tracked', 'true');
    });
  });
});
