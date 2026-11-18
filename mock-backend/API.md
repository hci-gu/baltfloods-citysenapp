# API usage

This document summarizes the external HTTP endpoints used by the app, with request/response shapes derived from the current codebase.

## StreetAI API (data points)

**Base URL**: `${streetAiApiUrl}/${streetAiApiJurisdictionId}`

- Defaults from `src/environments/environment.ts`:
  - `streetAiApiUrl`: `https://external.streetai.net/api/v1`
  - `streetAiApiJurisdictionId`: `lappeenranta`

**Auth**: `X-Api-Key: <streetAiApiKey>` header on every request.

### GET `/weather/conditions`

Returns an array of weather condition data points.

Response item shape:

- `name` (string)
- `latitude` (number)
- `longitude` (number)
- `dataRetrievedTimestamp` (number, unix seconds)
- Optional metrics (number | null): `temperature`, `humidity`, `visibility`, `pressure`, `dewPoint`, `windDirection`, `windSpeed`, `windGust`, `cloudCover`, `snowDepth`, `friction`, `ice`
- `streetState` ("dry" | "moist" | "wet" | "slushy" | "snowy" | "icy" | null)

### GET `/weather/air-quality`

Returns an array of air quality data points.

Response item shape:

- `name` (string)
- `latitude` (number)
- `longitude` (number)
- `dataRetrievedTimestamp` (number, unix seconds)
- `measurementIndex` (number)

### GET `/weather/storm-water`

Returns an array of storm water data points.

Response item shape:

- `name` (string)
- `latitude` (number)
- `longitude` (number)
- `dataRetrievedTimestamp` (number, unix seconds)
- `waterLevel` (number)
- `waterTemperature` (number)
- Optional: `electricalConductivity` (number | null), `turbidity` (number | null)
- `flowRate` (number)
- `fillLevel` (object):
  - `value` (number)
  - `result` (number)
- `waterQuality` (number)

### GET `/parking`

Returns an array of parking data points.

Response item shape:

- `name` (string)
- `latitude` (number)
- `longitude` (number)
- `dataSource` ("PARKING_FINNPARK" | "PARKING_AIMOPARK")
- `dataRetrievedTimestamp` (number, unix seconds)
- `availableSpots` (number)
- `capacity` (number | null)

### GET `/road-works`

Returns an array of road works data points.

Response item shape:

- `name` (string)
- `latitude` (number)
- `longitude` (number)
- `validityPeriod` (string, formatted as `"<from> - <to>"`)

### GET `/waterbag-testkit`

Returns an array of waterbag test kit data points.

Response item shape:

- `id` (string)
- `coords` (object):
  - `latitudeValue` (number)
  - `longitudeValue` (number)
- `dataRetrievedTimestamp` (number, unix seconds)
- `imageUrl` (string, relative or absolute; resolved by the UI as described below)
- Metrics (objects):
  - `airTemp`, `waterTemp`, `visibility`, `algae`: `{ value: number, dataRetrievedTimestamp: number }`
  - `waterPh`, `turbidity`, `nitrate`, `phosphate`: `{ value: number, dataRetrievedTimestamp: number, result: number }`
  - `dissolvedOxygen`: `{ value: number, dataRetrievedTimestamp: number, result: number, calculatedValue: number }`

**Image URL resolution**: PocketBase file paths such as `/api/files/observations/...`
resolve against `pocketbaseUrl` (which includes `/api`), including when the API
and frontend use different hosts. `/assets/...` paths use the frontend host,
absolute URLs are preserved, and legacy relative uploads use `streetAiUploadUrl`.

## Service API (eFeedback georeport)

**Base URL**: `serviceApiUrl` (default `https://kartta.lappeenranta.fi/efeedback/api/georeport/6aika`)

### GET `/services.json?jurisdiction_id={serviceApiJurisdictionId}`

Returns an array of service definitions.

Response item shape:

- `service_code` (string)
- `service_name` (string)
- `description` (string)
- `metadata` (boolean)
- `type` (string)
- `keywords` (string)
- `group` (string)

### POST `/requests.json?jurisdiction_id={serviceApiJurisdictionId}`

Creates a service request (feedback submission).

Content-Type: `multipart/form-data`

Form fields:

- Required:
  - `api_key` (string)
  - `service_code` (string)
  - `lat` (stringified number)
  - `long` (stringified number)
- Optional:
  - `email` (string)
  - `first_name` (string)
  - `last_name` (string)
  - `phone` (string)
  - `description` (string)
  - `media[]` (file, repeatable)

Response handling:

- The code does not use the response payload; it resolves to the submitted `email` value.

## Observation API (water observations)

**Base URL**: `observationApiUrl` (see `src/environments/environment.*.ts`)

### POST `/water`

Creates a water observation.

Content-Type: `multipart/form-data`

Auth (optional): include `Authorization: Bearer <pocketbase_user_token>` to
attach the created observation to that user. Anonymous submissions are still
allowed and will store `user` as empty.

Visibility defaults:

- authenticated `users` submitter: `visible = true`
- anonymous submitter: `visible = false`
Form fields:

- Required:
  - `latitude` (number)
  - `longitude` (number)
  - `observationType` ("water_system" | "stormwater" | "water_overflow")
  - For `water_system` / `stormwater`:
    - `identificationCode` (string)
    - `termsAccepted` (boolean)
    - `cc0Accepted` (boolean)
  - For `water_overflow`:
    - `photo` (file, required)
- Optional:
  - `photo` (file; optional for `water_system` / `stormwater`)
  - `airTemp` (number)
  - `waterTemp` (number)
  - `depthOfView` (number)
  - `algaeLevel` (string)
  - `waterPh` (number)
  - `turbidity` (number)
  - `dissolvedOxygen` (number)
  - `nitrate` (number)
  - `phosphate` (number)

Response:

- `{ id: string }`

### GET `/water`

Returns a list of submitted water observations.

Response item shape:

- `id` (string)
- `created` (string, datetime when the observation arrived)
- `latitude` (number)
- `longitude` (number)
- `dataRetrievedTimestamp` (number, unix seconds)
- `imageUrl` (string, relative file path or empty)
- `observationType` (string)
- Optional metrics: `airTemp`, `waterTemp`, `depthOfView`, `algaeLevel`, `waterPh`, `turbidity`, `dissolvedOxygen`, `nitrate`, `phosphate`

## Scheduled messages API (main page banners)

**Base URL**: `/messages`

### GET `/active`

Returns currently active scheduled messages for public display.

Response item shape:

- `id` (string)
- `title` (string)
- `content` (string, rich text HTML)
- `start` (string, datetime)
- `end` (string, datetime)
- `type` (`info` or `warning`)

Active window logic:

- A message is returned when current server time is between `start` and `end` (inclusive).
- Messages with missing or invalid time range are ignored.

### POST `/alert`

Creates an immediate dashboard message. Requires a logged-in PocketBase user with `type = "admin"`.

Content-Type: `application/json`

Request body:

- `title` (string, required)
- `content` (string, required rich text HTML)
- `type` (`info` or `warning`, optional, defaults to `info`)
- `durationHours` (number, optional, defaults to 2, capped at 168)

After the message is saved, PocketBase realtime broadcasts on `scheduled-messages-refresh`
so active dashboards can refetch `/messages/active` immediately.

## Push API (web push subscriptions)

**Base URL**: `pushApiUrl` (see `src/environments/environment.*.ts`)

### POST `/subscribe`

Stores or updates a push subscription.

Content-Type: `application/json`

Body:

- `endpoint` (string, required)
- `expirationTime` (number | null)
- `keys` (object):
  - `p256dh` (string)
  - `auth` (string)

Response:

- `{ id: string }`

### POST `/unsubscribe`

Removes a push subscription by endpoint.

Content-Type: `application/json`

Body:

- `endpoint` (string, required)

Response:

- `{ ok: true }`

### POST `/test`

Sends a test push notification to one subscription or all stored subscriptions.

**Auth**: PocketBase superuser token (same as Admin UI).

Content-Type: `application/json`

Body:

- `title` (string, required)
- `body` (string, optional)
- `icon` (string, optional)
- `url` (string, optional, passed via notification data)
- `endpoint` (string, optional; if omitted, sends to all)

Response:

- `sent` (number)
- `results` (array):
  - `endpoint` (string)
  - `status` (number)
  - `ok` (boolean)
  - `error` (string | empty)

### Admin test page

Static page served from `./pb_public/admin/push-test.html`.

Open: `/admin/push-test.html`

It posts to `/push/test` with a superuser token and shows the response.

## Runtime map origin and demo reset

The singleton `app_settings` record (`appsettings0001`) controls the map origin
and all generated storm-water, waterbag-testkit, and overflow observations.
Changing its `origin` through the normal PocketBase API or admin UI relocates
the app without rebuilding either application.

**Read (public)**: `GET /api/collections/app_settings/records/appsettings0001`

```json
{
  "id": "appsettings0001",
  "origin": { "latitude": 61.05871, "longitude": 28.18871 },
  "revision": 1
}
```

**Change (PocketBase superuser)**:
`PATCH /api/collections/app_settings/records/appsettings0001`

Use the usual `Authorization: Bearer <superuser_token>` header and this JSON body:

```json
{
  "origin": { "latitude": 59.4377, "longitude": 24.7330 }
}
```

Latitude and longitude must both be finite numbers, within ±90 and ±180
respectively. Zero is valid. `revision` is managed by the server. Saving the
same coordinates is a no-op. The record cannot be created or deleted through
the API, including by superusers; edit the existing record.

A successful change atomically replaces records marked `demoGenerated` with
10 storm-water, 10 waterbag-testkit, and 10 overflow records near the new
origin, then increments `revision`. Only one overflow observation is current;
together with the simulated sensor, this gives two demo data points in the
default 30-day map window. The other 29 observations are at least 31 days old
and span three years of history. Existing user submissions remain visible
according to their timestamps and moderation status. Layouts
are synthetic offsets, not actual local waterways. Generation failure rolls
back settings, observations, and the owned sensor together. Superseded concurrent
lookups are rejected; see the owned sensor section below.

The new migration conservatively marks historical seed records using their
seed names, image paths, and absence of submission metadata/user/photos.
Ordinary admin users cannot change this marker. Unmarked observations,
accounts, uploaded photos, messages, and service requests remain intact.
Other layers with no existing seed generator are not fabricated or relocated;
when enabled, real Intoto sensors are fetched near the new map center.

Clients subscribe to PocketBase's `app_settings/appsettings0001` realtime topic.
The settings update is delivered after commit. The frontend restarts at its
base map page when the revision changes, clearing in-memory drafts, filters,
selections, history caches, and pending requests while retaining login storage.
It rechecks on subscription/reconnect, returning online, visibility changes,
and every 30 seconds as a fallback when realtime is unavailable.

### Rollout

Deploy the updated backend first. Starting `serve` runs the new migration;
it initializes the origin to the historical backend seed origin (Lappeenranta)
and preserves existing observations. Then edit `app_settings.origin` to the
intended location and deploy the frontend. An older backend without this record
will cause the new frontend to show a retry screen instead of an incorrect map.

Ensure `pocketbaseUrl`, `streetAiApiUrl`, and `observationApiUrl` point to this
same backend. The tracked production/template environments use `/api`,
`/street-ai`, and `/observation`; these paths must reach PocketBase through your
hosting proxy or through explicitly configured backend URLs. Deployment API
jurisdiction identifiers and legal-page URLs remain deployment settings, not
geographic origins. The UI uses a neutral CitySen heading and international
phone numbers so an origin change does not retain a previous city's defaults.

### Verification

From `mock-backend`: `go test ./...` covers relocation, legacy cleanup,
submissions retained, no-op updates, coordinate validation, partial-generation
rollback, concurrent resets, and API permissions using temporary databases.
Frontend coverage includes bootstrap/retry, runtime map defaults, GPS precedence,
realtime resets, reconnects, and polling fallback.

## Owned flood sensor demo

The demo no longer depends on Intoto. `sensors` contains one permanent simulated
water-level sensor (`floodsensor0001`), `sensor_readings` contains its generated
history, and `demo_runs` (`floodrun0000001`) holds the shared stage, effective time,
seed, scenario version, and revision. The readings use metres above an arbitrary
local reference, **not elevation above sea level or actual flood measurements**.

Migration creates an unplaced sensor. On the first server start, an asynchronous
OpenStreetMap/Overpass lookup places it near the current origin and seeds its
history. A failed lookup leaves it unplaced with an explanation in
`run.placementError`; an administrator can retry or choose a position on the map.
The sensor is not plotted at arbitrary fallback coordinates.

### State and history (public)

- `GET /api/demo/state` returns `{settings, sensor, run, latest}` from one database
  snapshot. `latest` is the last reading at or before the demo cursor.
- `GET /api/sensors/floodsensor0001/history?from=<seconds>&to=<seconds>&revision=<run revision>`
  returns ascending `{timestamp, value}` readings, with Unix timestamps in seconds.
  The range is limited to four years and clipped to the demo cursor, so future
  flood readings are hidden. A superseded revision returns HTTP 409.
- Sensor and run metadata are publicly readable through PocketBase. Raw history
  and placement-cache collections require superuser access. Direct record writes
  through the collection API are blocked; use the commands below to retain
  consistent sensor/history/run state.

### Commands (administrator or PocketBase superuser)

Use an authenticated `users` token whose record has `type=admin`, or a superuser
bearer token. Ordinary users and anonymous clients cannot execute commands.

`POST /api/demo/action`:

```json
{ "stage": "peak", "revision": 2 }
```

The revision is the most recent `run.revision` from the state endpoint. Supported
stages are `normal`, `rising`, `warning`, `peak`, `recovery`, and `reset`:

| Stage | Demo offset | Water level | Meaning |
| --- | --- | --- | --- |
| normal | 0 h | 1.0 m | Baseline / start |
| rising | 6 h | 1.7 m | Yellow / watch |
| warning | 12 h | 2.3 m | Orange / warning |
| peak | 18 h | 3.2 m | Red / simulated flood |
| recovery | 72 h | 1.0 m | Normal; flood is outside the 12-hour alert window |
| reset | 0 h | 1.0 m | Regenerate sensor history and the sparse demo observations with fresh dates |

Stages are saved checkpoints, not a running wall-clock timer. They survive server
restarts. The baseline starts 72 hours before seeding so the complete flood fits
within real-world dates. History contains three years of daily readings, a month
of hourly readings, and 15-minute readings through the flood. The saved seed and
scenario version make sensor resets reproducible. Reset also replaces only
observations marked `demoGenerated`, using the same sparse dataset as a location
change, and broadcasts one observation refresh after the transaction commits.
Accounts, user submissions, and uploaded photos remain intact. The other stage
actions leave observations unchanged. Concurrent/stale commands return HTTP 409.

`POST /api/demo/location`:

```json
{
  "origin": { "latitude": 57.7089, "longitude": 11.9746 },
  "revision": 1,
  "runRevision": 2
}
```

This command finds water automatically, then atomically regenerates the sensor,
its history, demo run, and generated observations with the new origin. Both
revisions come from `/api/demo/state`. For a manual water-side position add:

```json
{ "placement": { "latitude": 57.7120, "longitude": 11.9650, "name": "Selected riverside" } }
```

Manual positions must be within 5 km of the supplied origin. An administrator is
responsible for choosing a water-side point; manual placement is not checked
against an external map. Its provenance is saved as `manual`.

### Automatic placement and relocation

Changing `app_settings.origin` directly as a superuser also invokes automatic
placement. Water lookup occurs **before** the write transaction, with a 15-second
HTTP deadline. The resolver searches within 5 km for river, canal, stream, and
water-polygon geometry, preferring named rivers/canals and proximity to bridges.
For lakes it uses an actual shoreline segment instead of a polygon centroid.
The feature name, OSM identity, coordinates, and provenance are saved. Successful
placements are cached by origin and reused when returning to a location. Explicit
automatic placement in the administrator panel replaces a saved manual override.

Override the service endpoint with `OVERPASS_API_URL` if needed (default:
`https://overpass-api.de/api/interpreter`). This read-only lookup sends the chosen
origin to that service; sensor data itself remains in PocketBase. Map/geometry
attribution is shown in the administrator location panel.

If no water is found or the service fails, the request fails with a manual
placement suggestion and the **previous complete app state remains intact**.
If the location or demo changes while a lookup is running, the obsolete result
is rejected with HTTP 409. Generation and placement-cache failures also roll back.
The location command can re-place/reseed a sensor at the same origin; unlike a
no-op raw settings PATCH, this intentionally increments the app revision.

### Frontend and testing

The administrator dashboard includes the flood controls and a location/map
picker. Map markers, threshold colours, warnings, and charts use sensor metadata,
regardless of provider. Demo labels identify simulated data. The sensor's effective
time is scoped to its warnings and charts; real observations keep real timestamps.
History keys include provider, sensor ID, and run revision. Stage changes cancel
old chart requests, clear cached history, and refresh the sensor in every open
client via `demo_runs/floodrun0000001` realtime events. Clients re-fetch after
reconnection and poll every 15 seconds if realtime is unavailable.

Intoto remains an optional real-data adapter: set `intotoEnabled: true` in the
frontend environment to enable it. It is disabled by default, and its thresholds
and data never control the owned demo.

To verify: run `go test ./...` in `mock-backend` and `npm test -- --runInBand` at
the repository root. In two browser tabs, sign in as an administrator in one,
open the map in the other, and try peak → recovery → reset. Then change the origin
and verify that both tabs restart at the new location. Test manual placement by
clicking a nearby shoreline in the location panel. Deploy the backend (including
migrations and the `sensordemo` Go package) before the updated frontend.
