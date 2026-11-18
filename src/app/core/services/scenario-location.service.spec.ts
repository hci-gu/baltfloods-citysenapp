import { TestBed } from '@angular/core/testing';
import { ScenarioLocationService } from './scenario-location.service';

describe('ScenarioLocationService', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it.each([
    ['53.252639', '14.487766'],
    ['53.252258', '14.545360'],
    ['53.252724', '14.483757'],
    ['0', '0'],
    ['-90', '-180'],
    ['90', '180'],
  ])('reads a valid scenario (%s, %s)', (lat, lon) => {
    window.history.replaceState(null, '', `/?lat=${lat}&lon=${lon}`);
    const service = TestBed.inject(ScenarioLocationService);
    expect(service.location).toEqual([Number(lat), Number(lon)]);
    expect(service.queryParams).toEqual({ lat: Number(lat), lon: Number(lon) });
  });

  it.each([
    '',
    '?lat=53',
    '?lon=14',
    '?lat=&lon=14',
    '?lat=53&lon=%20',
    '?lat=NaN&lon=14',
    '?lat=53&lon=Infinity',
    '?lat=91&lon=14',
    '?lat=53&lon=-181',
    '?lat=53north&lon=14',
  ])('ignores missing or invalid coordinates: %s', (query) => {
    window.history.replaceState(null, '', `/${query}`);
    const service = TestBed.inject(ScenarioLocationService);
    expect(service.location).toBeNull();
    expect(service.queryParams).toBeNull();
  });

  it('retains the scenario during navigation without storing it across page sessions', () => {
    window.history.replaceState(null, '', '/?lat=53.252258&lon=14.545360');
    const service = TestBed.inject(ScenarioLocationService);
    window.history.replaceState(null, '', '/observation');
    expect(service.location).toEqual([53.252258, 14.54536]);
    TestBed.resetTestingModule();
    expect(TestBed.inject(ScenarioLocationService).location).toBeNull();
  });
});
