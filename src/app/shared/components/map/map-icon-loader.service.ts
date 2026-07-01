import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import * as leaflet from 'leaflet';
import { Observable, firstValueFrom, shareReplay } from 'rxjs';
import { Marker } from './map.models';

@Injectable({ providedIn: 'root' })
export class MapIconLoaderService {
  private markerSvg$?: Observable<string>;
  private readonly iconSvgCache = new Map<string, Observable<string>>();

  public constructor(private readonly http: HttpClient) {}

  public async getMarkerDivIcon(marker: Marker): Promise<leaflet.DivIcon> {
    const { color, active, icon, count } = marker;
    const markerSvg = await firstValueFrom(this.getMarkerSvg());

    const fillColor = color ?? '#275D38';
    const strokeColor = active ? '#275D38' : fillColor;
    const styledMarkerSvg = markerSvg
      .replace('currentColor', fillColor)
      .replace('strokeColor', strokeColor);

    let iconSvg = '';
    if (icon) {
      iconSvg = await firstValueFrom(this.getIconSvg(icon));
    }

    const svg = `
        <div style="position: relative;">
          ${styledMarkerSvg}
          ${iconSvg}
          ${
            count && count > 1
              ? `<span class="marker-count-badge">${count}</span>`
              : ''
          }
        </div>
      `;

    return leaflet.divIcon({
      html: svg,
      ...this.getMarkerIconProperties(active),
    });
  }

  public getCircleMarkerDivIcon(marker: Marker): leaflet.DivIcon {
    const fillColor = marker.color ?? '#2563eb';

    return leaflet.divIcon({
      html: `<span class="location-dot" style="background-color: ${fillColor};"></span>`,
      iconAnchor: [6, 6],
      iconSize: [12, 12],
      className: 'location-dot-marker',
    });
  }

  private getMarkerSvg(): Observable<string> {
    if (!this.markerSvg$) {
      this.markerSvg$ = this.http
        .get('/assets/icons/marker.svg', { responseType: 'text' })
        .pipe(shareReplay(1));
    }

    return this.markerSvg$;
  }

  private getIconSvg(icon: string): Observable<string> {
    const cachedIconSvg = this.iconSvgCache.get(icon);
    if (cachedIconSvg) {
      return cachedIconSvg;
    }

    const iconSvg$ = this.http
      .get(`/assets/icons/${icon}`, { responseType: 'text' })
      .pipe(shareReplay(1));
    this.iconSvgCache.set(icon, iconSvg$);
    return iconSvg$;
  }

  private getMarkerIconProperties(active: boolean | undefined): {
    iconAnchor: leaflet.PointExpression;
    iconSize: leaflet.PointExpression;
    className: string;
  } {
    const size = (active ? [44, 53] : [33, 40]) as leaflet.PointExpression;
    const anchor = (active ? [22, 53] : [16.5, 40]) as leaflet.PointExpression;
    const className = active ? 'active' : '';

    return { iconAnchor: anchor, iconSize: size, className };
  }
}
