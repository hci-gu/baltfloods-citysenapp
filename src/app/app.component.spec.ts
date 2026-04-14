import { Shallow } from 'shallow-render';
import { AppComponent } from './app.component';
import { ActivatedRoute, RouterModule, RouterOutlet } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { NavigationHeaderComponent } from './shared/components/navigation/navigation-header/navigation-header.component';
import { SharedModule } from 'primeng/api';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { GoogleAnalyticsService } from 'ngx-google-analytics';
import { LocationService } from '@core/services/location.service';
import { AuthService } from '@core/services/auth.service';
import { of } from 'rxjs';

describe('AppComponent', () => {
  let shallow: Shallow<AppComponent>;

  beforeEach(() => {
    shallow = new Shallow(AppComponent)
      .mock(TranslateService, { instant: jest.fn(), use: jest.fn() })
      .mock(GoogleAnalyticsService, { pageView: jest.fn() })
      .mockPipe(TranslatePipe, (input) => `translated ${input}`)
      .provideMock(SharedModule)
      .mock(AuthService, { authState$: of({ token: null, record: null }) })
      .mock(LocationService, { setOverriddenLocation: jest.fn() })
      .mock(ActivatedRoute, {
        snapshot: {
          queryParamMap: {
            get: jest.fn(),
          },
        },
      });

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

    it('should set overridden location when lat and lon are present in query params', async () => {
      const lat = '55.123';
      const lon = '12.456';
      
      const { inject, instance } = await shallow.render();
      const route = inject(ActivatedRoute);
      const locationService = inject(LocationService);

      (route.snapshot.queryParamMap.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'lat') return lat;
        if (key === 'lon') return lon;
        return null;
      });

      instance.ngOnInit();

      expect(locationService.setOverriddenLocation).toHaveBeenCalledWith([
        parseFloat(lat),
        parseFloat(lon),
      ]);
    });

    it('should not set overridden location when lat or lon are missing in query params', async () => {
      const { inject, instance } = await shallow.render();
      const route = inject(ActivatedRoute);
      const locationService = inject(LocationService);

      (route.snapshot.queryParamMap.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'lat') return '55.123';
        return null;
      });

      instance.ngOnInit();

      expect(locationService.setOverriddenLocation).not.toHaveBeenCalled();
    });

    it('should not set overridden location when lat or lon are invalid', async () => {
      const { inject, instance } = await shallow.render();
      const route = inject(ActivatedRoute);
      const locationService = inject(LocationService);

      (route.snapshot.queryParamMap.get as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === 'lat') return 'invalid';
          if (key === 'lon') return '12.456';
          return null;
        },
      );

      instance.ngOnInit();

      expect(locationService.setOverriddenLocation).not.toHaveBeenCalled();
    });

    it('should set overridden location from window search params when route snapshot params are missing', async () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/mocked-path',
          search: '?lat=57.7089&lon=11.9746',
        },
        writable: true,
      });

      const { inject, instance } = await shallow.render();
      const route = inject(ActivatedRoute);
      const locationService = inject(LocationService);

      (route.snapshot.queryParamMap.get as jest.Mock).mockReturnValue(null);

      instance.ngOnInit();

      expect(locationService.setOverriddenLocation).toHaveBeenCalledWith([
        57.7089,
        11.9746,
      ]);
    });
  });
});
