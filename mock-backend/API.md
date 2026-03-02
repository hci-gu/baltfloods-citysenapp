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
- `imageUrl` (string, relative or absolute; UI prepends `streetAiUploadUrl` when needed)
- Metrics (objects):
  - `airTemp`, `waterTemp`, `visibility`, `algae`: `{ value: number, dataRetrievedTimestamp: number }`
  - `waterPh`, `turbidity`, `nitrate`, `phosphate`: `{ value: number, dataRetrievedTimestamp: number, result: number }`
  - `dissolvedOxygen`: `{ value: number, dataRetrievedTimestamp: number, result: number, calculatedValue: number }`

**Related base URL for image files**: `streetAiUploadUrl` (default `https://opendata.streetai.net/uploads`).

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

Active window logic:
- A message is returned when current server time is between `start` and `end` (inclusive).
- Messages with missing or invalid time range are ignored.

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
