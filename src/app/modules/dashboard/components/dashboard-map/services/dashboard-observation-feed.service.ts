import { Injectable } from '@angular/core';
import { DataPoint, DataPointType } from '@core/models/data-point';
import { environment } from '@environments/environment';
import { OBSERVATION_TIMELINE_COLOR } from '../dashboard-map.constants';
import { normalizeImageUrl } from '../dashboard-image-url.utils';
import { ObservationFeedItem } from '../dashboard-map.types';
import { isPointWithinBounds } from '../dashboard-map-geometry.utils';
import { MapBounds } from '@shared/components/map/map.component';

@Injectable({
  providedIn: 'root',
})
export class DashboardObservationFeedService {
  public buildObservationFeed(
    dataPoints: DataPoint[],
    visibleMapBounds: MapBounds | null,
  ): ObservationFeedItem[] {
    return dataPoints
      .filter((point) => isPointWithinBounds(point.location, visibleMapBounds))
      .slice()
      .sort((a, b) => this.compareObservationFeedDataPoints(a, b))
      .map((point, index) => ({
        id: `${point.type}-${point.name}-${point.location.join(',')}-${point.lastUpdatedOn?.getTime() ?? index}-${point.createdOn?.getTime() ?? index}`,
        name: point.name,
        location: point.location,
        type: point.type,
        typeLabel: this.getObservationFeedTypeLabel(point),
        lastUpdatedOn: point.lastUpdatedOn,
        createdOn: point.createdOn,
        imageUrl: this.getObservationImageUrl(point),
      }));
  }

  public getObservationTypeLabel(type: DataPointType): string {
    switch (type) {
      case DataPointType.WEATHER_CONDITIONS:
        return 'Weather conditions';
      case DataPointType.AIR_QUALITY:
        return 'Air quality';
      case DataPointType.STORM_WATER:
        return 'Storm water';
      case DataPointType.PARKING:
        return 'Parking';
      case DataPointType.ROAD_WORKS:
        return 'Road works';
      case DataPointType.WATERBAG_TESTKIT:
        return 'Water observations';
      default:
        return 'Observation';
    }
  }

  public getObservationFeedTypeLabel(point: DataPoint): string {
    if (
      point.type === DataPointType.STORM_WATER &&
      point.historySeries?.provider === 'intoto'
    ) {
      return 'Sensor reading';
    }

    return this.getObservationTypeLabel(point.type);
  }

  public getObservationTypeColor(type: DataPointType): string {
    return OBSERVATION_TIMELINE_COLOR[type];
  }

  private compareObservationFeedDataPoints(
    left: DataPoint,
    right: DataPoint,
  ): number {
    const dataRetrievedDifference =
      this.getDateTimestamp(right.lastUpdatedOn) -
      this.getDateTimestamp(left.lastUpdatedOn);
    if (dataRetrievedDifference !== 0) {
      return dataRetrievedDifference;
    }

    return (
      this.getDateTimestamp(right.createdOn) -
      this.getDateTimestamp(left.createdOn)
    );
  }

  private getDateTimestamp(value: Date | undefined): number {
    const timestamp = value?.getTime() ?? 0;
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private getObservationImageUrl(point: DataPoint): string | undefined {
    if (point.type !== DataPointType.WATERBAG_TESTKIT || !point.imageUrl) {
      return undefined;
    }

    return normalizeImageUrl(
      point.imageUrl,
      environment.pocketbaseUrl,
      environment.streetAiUploadUrl,
    );
  }
}
