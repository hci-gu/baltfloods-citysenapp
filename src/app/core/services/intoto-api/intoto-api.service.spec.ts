import { HttpClient, HttpClientModule } from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { Shallow } from 'shallow-render';
import { environment } from '@environments/environment';
import { CoreModule } from '@core/core.module';
import { IntotoApiService } from './intoto-api.service';
import {
  IntotoEnumDto,
  IntotoMyAreaDto,
  IntotoSeriesDataDto,
} from './models';

describe('IntotoApiService', () => {
  let shallow: Shallow<IntotoApiService>;

  beforeEach(() => {
    shallow = new Shallow(IntotoApiService, CoreModule)
      .import(HttpClientTestingModule)
      .dontMock(HttpClientTestingModule)
      .replaceModule(HttpClientModule, HttpClientTestingModule);
  });

  it('uses x-api-key auth on enum routes', async () => {
    const { instance, inject } = shallow.createService();
    const httpTestingController = inject(HttpTestingController);
    const responsePromise = firstValueFrom(instance.getLocationTypes());

    const req = httpTestingController.expectOne(
      `${environment.intoToApiUrl}/enums/locationTypes`,
    );

    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-api-key')).toBe(environment.intoToApiKey);

    req.flush({ data: ENUM_RESPONSE });

    await expect(responsePromise).resolves.toEqual(ENUM_RESPONSE);
  });

  it('fetches my areas', async () => {
    const { instance, inject } = shallow.createService();
    const httpTestingController = inject(HttpTestingController);
    const responsePromise = firstValueFrom(instance.getMyAreas());

    const req = httpTestingController.expectOne(
      `${environment.intoToApiUrl}/myareas`,
    );

    expect(req.request.method).toBe('GET');
    req.flush({ data: MY_AREAS_RESPONSE });

    await expect(responsePromise).resolves.toEqual(MY_AREAS_RESPONSE);
  });

  it('fetches series data with optional date filters', async () => {
    const { instance, inject } = shallow.createService();
    const httpTestingController = inject(HttpTestingController);
    const fromDateTime = new Date('2026-03-01T00:00:00.000Z');
    const toDateTime = '2026-03-02T00:00:00.000Z';
    const responsePromise = firstValueFrom(
      instance.getSeriesData(42, { fromDateTime, toDateTime }),
    );

    const req = httpTestingController.expectOne(
      (request) =>
        request.url === `${environment.intoToApiUrl}/series/data/42` &&
        request.params.get('fromDateTime') === fromDateTime.toISOString() &&
        request.params.get('toDateTime') === toDateTime,
    );

    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('x-api-key')).toBe(environment.intoToApiKey);
    req.flush({ data: SERIES_DATA_RESPONSE });

    await expect(responsePromise).resolves.toEqual(SERIES_DATA_RESPONSE);
  });
});

const ENUM_RESPONSE: IntotoEnumDto[] = [
  {
    value: 1,
    name: 'Standard',
    description: 'Location Location',
  },
];

const MY_AREAS_RESPONSE: IntotoMyAreaDto[] = [
  {
    id: 1,
    name: 'Central Gothenburg',
    description: 'Area root',
    childAreas: null,
    locations: [
      {
        id: 10,
        name: 'River sensor',
        locationType: 72,
        wgs84latitude: 57.70887,
        wgs84longitude: 11.97365,
        wgs84elevation: null,
        series: [
          {
            id: 100,
            description: 'Water level',
            providerInfo: 'Intoto',
            seriesCategory: 2,
            seriesSubCategory: 100,
            seriesAggregationPeriod: 1,
            seriesAggregationMethod: 1,
            seriesUnit: 210,
          },
        ],
      },
    ],
  },
];

const SERIES_DATA_RESPONSE: IntotoSeriesDataDto[] = [
  {
    error: false,
    timestamp: '2026-03-01T00:00:00Z',
    value: 1.23,
  },
];
