import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LatLong } from '@core/models/location';
import {
  SensorDemoService,
  SensorDemoState,
  SensorPlacement,
} from '@core/services/sensor-demo.service';
import { MapComponent, Marker } from '@shared/components/map/map.component';
import { BehaviorSubject, Observable, finalize } from 'rxjs';

@Component({
  selector: 'app-admin-sensor-demo',
  standalone: true,
  imports: [DatePipe, FormsModule, MapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="demo-panel" aria-labelledby="demo-title">
      <h2 id="demo-title">Flood demonstration</h2>
      <p>
        Generated sensor readings and a simulated flood. Demo time affects this
        sensor only.
      </p>
      @if (state(); as current) {
        <p>
          <strong>{{
            current.sensor.ready ? current.run.stage : 'Sensor needs a location'
          }}</strong>
          @if (current.sensor.ready) {
            · {{ current.latest?.value }} {{ current.sensor.unit }} · Demo time
            {{ current.run.cursor * 1000 | date: 'medium' }}
          }
        </p>
        @if (current.sensor.ready) {
          <p>
            Near {{ current.sensor.placement.name }} ·
            {{ current.sensor.placement.source }} ({{
              current.sensor.latitude.toFixed(5)
            }}, {{ current.sensor.longitude.toFixed(5) }})
          </p>
        }
        @if (current.run.placementError) {
          <p role="status">{{ current.run.placementError }}</p>
        }
        <div class="actions" aria-label="Demo controls">
          @for (action of actions; track action.stage) {
            <button
              type="button"
              [disabled]="busy() || !current.sensor.ready"
              (click)="act(action.stage)"
            >
              {{ action.label }}
            </button>
          }
        </div>
        <p>
          Back to normal advances beyond the flood and its alert window. Reset
          restores the sensor baseline and demo observations with fresh dates.
          The default map shows two demo points; user submissions are kept.
        </p>
        <button
          type="button"
          (click)="editing.set(!editing())"
          [disabled]="busy()"
        >
          {{
            editing()
              ? 'Close location settings'
              : 'Change location / place sensor'
          }}
        </button>
        @if (editing()) {
          <fieldset [disabled]="busy()">
            <legend>Map origin</legend>
            <p>
              Changing the origin resets the app and regenerates its demo
              observations and sensor history. Existing submitted observations
              are preserved.
            </p>
            <div class="coordinates">
              <label
                >Latitude
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  [(ngModel)]="latitude"
                  (ngModelChange)="originEdited()"
              /></label>
              <label
                >Longitude
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  [(ngModel)]="longitude"
                  (ngModelChange)="originEdited()"
              /></label>
              <button
                type="button"
                [disabled]="!validOrigin()"
                (click)="showOrigin()"
              >
                Show on map
              </button>
            </div>
            <div class="placement-map">
              <app-map
                [center$]="center$"
                [markers]="markers()"
                (mapClick)="pick($event)"
              />
            </div>
            <p>
              Automatic placement chooses a nearby river or shoreline. To
              override it, click a water-side point within 5 km of the origin.
            </p>
            @if (manual(); as pin) {
              <p>
                Selected sensor position: {{ pin.latitude.toFixed(5) }},
                {{ pin.longitude.toFixed(5) }} (manual)
              </p>
              <button type="button" (click)="clearPin()">
                Use automatic placement
              </button>
            }
            <button
              type="button"
              [disabled]="!validOrigin()"
              (click)="saveLocation()"
            >
              {{
                manual()
                  ? 'Save selected location & reset'
                  : 'Find water & reset at this origin'
              }}
            </button>
            <p class="attribution">
              Map and water geometry © OpenStreetMap contributors.
            </p>
          </fieldset>
        }
      } @else {
        <p>Loading sensor state…</p>
        <button type="button" (click)="demo.refresh()">Retry</button>
      }
      @if (busy()) {
        <p role="status">{{ busy() }}</p>
      }
      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-bottom: 1.5rem;
      }
      .demo-panel {
        background: white;
        border: 1px solid #d6dfd8;
        border-radius: 1rem;
        padding: 1.25rem;
      }
      h2 {
        margin: 0 0 0.75rem;
        font-size: 1.3rem;
      }
      p {
        margin: 0.75rem 0;
        line-height: 1.5;
      }
      .actions,
      .coordinates {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        align-items: end;
      }
      button {
        border: 1px solid #275d38;
        border-radius: 0.5rem;
        background: #f3f8f4;
        padding: 0.65rem 0.9rem;
        color: #173d23;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      button:focus-visible,
      input:focus-visible {
        outline: 3px solid #62a6df;
      }
      fieldset {
        margin-top: 1rem;
        border: 1px solid #c9d4cc;
        border-radius: 0.5rem;
        padding: 1rem;
      }
      label {
        display: grid;
        gap: 0.25rem;
      }
      input {
        width: 10rem;
        border: 1px solid #8b9a90;
        border-radius: 0.3rem;
        padding: 0.6rem;
      }
      .placement-map {
        height: 340px;
        position: relative;
        margin-top: 1rem;
      }
      .placement-map app-map {
        display: block;
        height: 100%;
      }
      .error {
        color: #a51b1b;
      }
      .attribution {
        font-size: 0.8rem;
      }
    `,
  ],
})
export class AdminSensorDemoComponent {
  public readonly demo = inject(SensorDemoService);
  private readonly destroyRef = inject(DestroyRef);
  public readonly state = signal<SensorDemoState | null>(null);
  public readonly busy = signal('');
  public readonly error = signal('');
  public readonly editing = signal(false);
  public readonly manual = signal<SensorPlacement | undefined>(undefined);
  public readonly markers = signal<Marker[]>([]);
  public readonly center$ = new BehaviorSubject<LatLong>([0, 0]);
  public latitude = 0;
  public longitude = 0;
  public readonly actions = [
    { stage: 'normal', label: 'Start / baseline' },
    { stage: 'rising', label: 'Rising water' },
    { stage: 'warning', label: 'Warning level' },
    { stage: 'peak', label: 'Trigger flooding' },
    { stage: 'recovery', label: 'Back to normal' },
    { stage: 'reset', label: 'Reset demo' },
  ];

  public constructor() {
    this.demo.state$.pipe(takeUntilDestroyed()).subscribe((state) => {
      if (!this.state()) {
        this.latitude = state.settings.origin.latitude;
        this.longitude = state.settings.origin.longitude;
        this.showOrigin();
        if (state.sensor.ready) {
          this.markers.set([
            {
              location: [state.sensor.latitude, state.sensor.longitude],
              color: '#275d38',
              icon: 'flood-water-level-icon.svg',
            },
          ]);
        } else {
          this.editing.set(true);
        }
      }
      this.state.set(state);
    });
  }

  public validOrigin(): boolean {
    return (
      Number.isFinite(this.latitude) &&
      Math.abs(this.latitude) <= 90 &&
      Number.isFinite(this.longitude) &&
      Math.abs(this.longitude) <= 180
    );
  }
  public originEdited(): void {
    this.clearPin();
  }
  public showOrigin(): void {
    if (this.validOrigin()) {
      this.center$.next([this.latitude, this.longitude]);
    }
  }
  public pick(location: LatLong): void {
    if (this.busy()) {
      return;
    }
    this.manual.set({ latitude: location[0], longitude: location[1] });
    this.markers.set([
      { location, color: '#275d38', icon: 'flood-water-level-icon.svg' },
    ]);
  }
  public clearPin(): void {
    this.manual.set(undefined);
    this.markers.set([]);
  }
  public act(stage: string): void {
    const state = this.state();
    if (state) {
      this.perform(
        this.demo.action(stage, state.run.revision),
        'Updating demo…',
      );
    }
  }
  public saveLocation(): void {
    const state = this.state();
    if (state && this.validOrigin()) {
      this.perform(
        this.demo.relocate(
          { latitude: this.latitude, longitude: this.longitude },
          state,
          this.manual(),
        ),
        'Finding water and preparing the new location…',
      );
    }
  }
  private perform(request: Observable<unknown>, message: string): void {
    if (this.busy()) {
      return;
    }
    this.error.set('');
    this.busy.set(message);
    request
      .pipe(
        finalize(() => this.busy.set('')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        error: (error) => {
          this.error.set(
            error?.error?.message ??
              'The demo could not be updated. Please try again.',
          );
          this.demo.refresh();
        },
      });
  }
}
