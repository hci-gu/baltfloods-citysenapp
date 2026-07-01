import { Injectable } from '@angular/core';
import { SENSOR_THRESHOLD_COLORS } from '@core/config/sensor-thresholds';
import {
  DATA_POINT_QUALITY_COLOR_CHART,
  DATA_POINT_TYPE_ICON,
  DataPoint,
  DataPointQuality,
  DataPointType,
} from '@core/models/data-point';
import { LatLong } from '@core/models/location';
import { UserLocation } from '@core/services/location.service';
import { MapBounds, Marker } from '@shared/components/map/map.component';
import { isSameLocation } from '@shared/utils/location-utils';
import { groupBy } from 'lodash-es';
import { INTOTO_SENSOR_MARKER_ICON } from '../dashboard-map.constants';
import {
  DataPointCluster,
  ObservationTimespanBounds,
  SensorHistoryCacheEntry,
} from '../dashboard-map.types';
import {
  getPixelDistance,
  projectLocationToWorldPixel,
} from '../dashboard-map-geometry.utils';
import { DashboardSensorWarningsService } from './dashboard-sensor-warnings.service';

@Injectable({
  providedIn: 'root',
})
export class DashboardMapMarkersService {
  private readonly markerOverlapPixelDistance = 34;

  public constructor(
    private readonly sensorWarningsService: DashboardSensorWarningsService,
  ) {}

  public createMarkersFromDataPoints(
    points: DataPoint[],
    activeLocation: LatLong | undefined,
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
    observationBounds: ObservationTimespanBounds,
    visibleMapBounds: MapBounds | null,
  ): Marker[] {
    const clusters = this.createDataPointClusters(points, visibleMapBounds);

    return clusters.map((cluster) => {
      const dataPoints = cluster.points;
      const hasMultipleDataPoints = dataPoints.length > 1;

      return {
        location: cluster.location,
        ...(hasMultipleDataPoints && { count: dataPoints.length }),
        icon: hasMultipleDataPoints
          ? 'multiple-data-points.svg'
          : this.getMarkerIcon(dataPoints[0]),
        color: this.getMarkerColor(
          dataPoints,
          sensorHistoryCache,
          observationBounds,
        ),
        ...(activeLocation &&
          this.isClusterActive(cluster, activeLocation) && {
            active: true,
          }),
      };
    });
  }

  public createDataPointClusters(
    points: DataPoint[],
    visibleMapBounds: MapBounds | null,
  ): DataPointCluster[] {
    const zoom = visibleMapBounds?.zoom ?? 13;
    const clusters: {
      points: DataPoint[];
      projectedPoints: { x: number; y: number }[];
    }[] = [];

    points.forEach((point) => {
      const projectedPoint = projectLocationToWorldPixel(point.location, zoom);
      const overlappingClusters = clusters.filter((cluster) =>
        cluster.projectedPoints.some(
          (clusterPoint) =>
            getPixelDistance(clusterPoint, projectedPoint) <=
            this.markerOverlapPixelDistance,
        ),
      );

      if (overlappingClusters.length > 0) {
        const mergedCluster = overlappingClusters[0];
        mergedCluster.points.push(point);
        mergedCluster.projectedPoints.push(projectedPoint);

        for (let index = clusters.length - 1; index >= 0; index--) {
          const cluster = clusters[index];
          if (
            cluster !== mergedCluster &&
            overlappingClusters.includes(cluster)
          ) {
            mergedCluster.points.push(...cluster.points);
            mergedCluster.projectedPoints.push(...cluster.projectedPoints);
            clusters.splice(index, 1);
          }
        }

        return;
      }

      clusters.push({
        points: [point],
        projectedPoints: [projectedPoint],
      });
    });

    return clusters.map((cluster) => ({
      location: this.getClusterLocation(cluster.points),
      points: cluster.points
        .slice()
        .sort(
          (a, b) =>
            (b.lastUpdatedOn?.getTime() ?? 0) -
            (a.lastUpdatedOn?.getTime() ?? 0),
        ),
    }));
  }

  public isClusterActive(
    cluster: DataPointCluster,
    activeLocation: LatLong,
  ): boolean {
    return (
      isSameLocation(cluster.location, activeLocation) ||
      cluster.points.some((point) =>
        isSameLocation(point.location, activeLocation),
      )
    );
  }

  public createUserLocationMarker(userLocation: UserLocation): Marker | null {
    if (!userLocation.location) {
      return null;
    }

    return {
      location: userLocation.location,
      displayMode: 'circle',
      color: '#2563eb',
    };
  }

  public createHeatmapMarkers(points: DataPoint[]): Marker[] {
    const pointsByLocation = groupBy(points, 'location');
    const locationEntries = Object.entries(pointsByLocation).map(
      ([, dataPoints]) => ({
        location: dataPoints[0].location,
        intensity: dataPoints.length,
      }),
    );
    const maxIntensity = Math.max(
      1,
      ...locationEntries.map((entry) => entry.intensity),
    );

    return locationEntries.map((entry) => {
      const ratio = entry.intensity / maxIntensity;
      return {
        location: entry.location,
        displayMode: 'heatmap',
        heatIntensity: Math.max(0.1, ratio),
      };
    });
  }

  private getClusterLocation(points: DataPoint[]): LatLong {
    const totals = points.reduce(
      (current, point) => ({
        latitude: current.latitude + point.location[0],
        longitude: current.longitude + point.location[1],
      }),
      { latitude: 0, longitude: 0 },
    );

    return [
      totals.latitude / points.length,
      totals.longitude / points.length,
    ] as LatLong;
  }

  private getMarkerIcon(point: DataPoint): string {
    if (
      point.type === DataPointType.STORM_WATER &&
      point.historySeries?.provider === 'intoto'
    ) {
      return INTOTO_SENSOR_MARKER_ICON;
    }

    return DATA_POINT_TYPE_ICON[point.type];
  }

  private getMarkerColor(
    dataPoints: DataPoint[],
    sensorHistoryCache: Record<string, SensorHistoryCacheEntry>,
    observationBounds: ObservationTimespanBounds,
  ): string {
    const thresholdSeverity =
      this.sensorWarningsService.getHighestActiveSensorThresholdSeverity(
        dataPoints,
        observationBounds,
        sensorHistoryCache,
      );
    if (thresholdSeverity) {
      return SENSOR_THRESHOLD_COLORS[thresholdSeverity];
    }

    if (dataPoints.length > 1) {
      return DATA_POINT_QUALITY_COLOR_CHART[DataPointQuality.DEFAULT];
    }

    return DATA_POINT_QUALITY_COLOR_CHART[dataPoints[0].quality];
  }
}
