import {
  DataPointQuality,
  DataPointType,
  WaterbagTestKitDataPoint,
} from '@core/models/data-point';
import { environment } from '@environments/environment';
import { DashboardObservationFeedService } from './dashboard-observation-feed.service';

describe('DashboardObservationFeedService image URLs', () => {
  const service = new DashboardObservationFeedService();

  it.each([
    [
      '/api/files/observations/uploaded-1/photo.jpg',
      `${environment.pocketbaseUrl}/files/observations/uploaded-1/photo.jpg`,
    ],
    ['/assets/images/water_overflow.jpg', '/assets/images/water_overflow.jpg'],
  ])('builds a feed with the correct image location for %s', (imageUrl, expected) => {
    const point: WaterbagTestKitDataPoint = {
      type: DataPointType.WATERBAG_TESTKIT,
      name: 'Overflow observation',
      location: [57.7, 11.9],
      quality: DataPointQuality.DEFAULT,
      imageUrl,
      data: {},
    };

    const feed = service.buildObservationFeed([point], null);

    expect(feed[0].imageUrl).toBe(expected);
  });
});
