# Implementation plan: PocketBase mock for StreetAI + Service API

Goal: mirror the StreetAI and Service API routes listed in `API.md`, but served from PocketBase with the same request/response shapes. All routes should be prefixed with `/street-ai` or `/service-api` to avoid collisions.

## 1) Routing + base URLs
- Add a PocketBase HTTP hook or custom router that exposes:
  - StreetAI: `/street-ai/{jurisdictionId}` + all StreetAI routes.
  - Service API: `/service-api` + all Service API routes.
- Keep the external query/path semantics the same after the prefix:
  - `/street-ai/{jurisdictionId}/weather/conditions`
  - `/street-ai/{jurisdictionId}/weather/air-quality`
  - `/street-ai/{jurisdictionId}/weather/storm-water`
  - `/street-ai/{jurisdictionId}/parking`
  - `/street-ai/{jurisdictionId}/road-works`
  - `/street-ai/{jurisdictionId}/waterbag-testkit`
  - `/service-api/services.json?jurisdiction_id={serviceApiJurisdictionId}`
  - `/service-api/requests.json?jurisdiction_id={serviceApiJurisdictionId}`

## 2) StreetAI auth parity
- Require `X-Api-Key` header for all `/street-ai/*` routes.
- Decide a mock API key (env or config). Return 401/403 if missing/invalid.

## 3) Collections + data model in PocketBase
Create collections that map 1:1 to response item shapes.

### 3.1 Weather conditions
Collection: `streetai_weather_conditions`
- name (text)
- latitude (number)
- longitude (number)
- dataRetrievedTimestamp (number; unix seconds)
- temperature (number, optional)
- humidity (number, optional)
- visibility (number, optional)
- pressure (number, optional)
- dewPoint (number, optional)
- windDirection (number, optional)
- windSpeed (number, optional)
- windGust (number, optional)
- cloudCover (number, optional)
- snowDepth (number, optional)
- friction (number, optional)
- ice (number, optional)
- streetState (select: dry | moist | wet | slushy | snowy | icy, optional)

### 3.2 Air quality
Collection: `streetai_air_quality`
- name (text)
- latitude (number)
- longitude (number)
- dataRetrievedTimestamp (number)
- measurementIndex (number)

### 3.3 Storm water
Collection: `streetai_storm_water`
- name (text)
- latitude (number)
- longitude (number)
- dataRetrievedTimestamp (number)
- waterLevel (number)
- waterTemperature (number)
- electricalConductivity (number, optional)
- turbidity (number, optional)
- flowRate (number)
- fillLevel_value (number)
- fillLevel_result (number)
- waterQuality (number)

### 3.4 Parking
Collection: `streetai_parking`
- name (text)
- latitude (number)
- longitude (number)
- dataSource (select: PARKING_FINNPARK | PARKING_AIMOPARK)
- dataRetrievedTimestamp (number)
- availableSpots (number)
- capacity (number, optional)

### 3.5 Road works
Collection: `streetai_road_works`
- name (text)
- latitude (number)
- longitude (number)
- validityPeriod (text, format `"<from> - <to>"`)

### 3.6 Waterbag testkit
Collection: `streetai_waterbag_testkit`
- id (text) — if using PB record id, map/alias to `id` in response
- coords_latitudeValue (number)
- coords_longitudeValue (number)
- dataRetrievedTimestamp (number)
- imageUrl (text)
- airTemp_value (number)
- airTemp_dataRetrievedTimestamp (number)
- waterTemp_value (number)
- waterTemp_dataRetrievedTimestamp (number)
- visibility_value (number)
- visibility_dataRetrievedTimestamp (number)
- algae_value (number)
- algae_dataRetrievedTimestamp (number)
- waterPh_value (number)
- waterPh_dataRetrievedTimestamp (number)
- waterPh_result (number)
- turbidity_value (number)
- turbidity_dataRetrievedTimestamp (number)
- turbidity_result (number)
- nitrate_value (number)
- nitrate_dataRetrievedTimestamp (number)
- nitrate_result (number)
- phosphate_value (number)
- phosphate_dataRetrievedTimestamp (number)
- phosphate_result (number)
- dissolvedOxygen_value (number)
- dissolvedOxygen_dataRetrievedTimestamp (number)
- dissolvedOxygen_result (number)
- dissolvedOxygen_calculatedValue (number)

### 3.7 Service API services
Collection: `service_api_services`
- service_code (text)
- service_name (text)
- description (text)
- metadata (bool)
- type (text)
- keywords (text)
- group (text)

### 3.8 Service API requests (feedback)
Collection: `service_api_requests`
- api_key (text)
- service_code (text)
- lat (text)
- long (text)
- email (text, optional)
- first_name (text, optional)
- last_name (text, optional)
- phone (text, optional)
- description (text, optional)
- media (file, multiple)

## 4) Response shaping + field transforms
- For all GET lists: return plain arrays, not PB list envelopes.
- Map nested response objects on read:
  - Storm water: `fillLevel` → `{ value, result }` from `fillLevel_value`, `fillLevel_result`.
  - Waterbag: `coords` and nested metric objects rebuilt from flat fields.
- Ensure `id` for waterbag testkit uses `record.id` unless an explicit `id` field is stored.

## 5) Endpoints behavior details
### 5.1 StreetAI GET endpoints
- Read from corresponding collections; optional filtering by `jurisdictionId` if needed (add a `jurisdictionId` field in each collection if you need multi-tenant data).
- Return sorted data if the frontend expects ordering; otherwise return as stored.

### 5.2 Service API GET `/services.json`
- Query `service_api_services` and return array.
- Use `jurisdiction_id` query param for future filtering (optional).

### 5.3 Service API POST `/requests.json`
- Accept `multipart/form-data` with repeatable `media[]` file parts.
- Store payload in `service_api_requests`.
- Return a 200 response; body can be minimal, since the client only uses the submitted `email` value.

## 6) Config + env defaults
- Add env vars for:
  - `STREET_AI_API_KEY` (required)
  - Optional `STREET_AI_DEFAULT_JURISDICTION`
  - Optional `SERVICE_API_DEFAULT_JURISDICTION`
- Keep defaults aligned with `API.md` for consistency.

## 7) Testing + fixtures
- Seed sample data for each collection to support UI development.
- Add a lightweight smoke test:
  - GET each StreetAI endpoint → array response with expected keys.
  - GET `/service-api/services.json` → array response.
  - POST `/service-api/requests.json` with multipart → 200.

## 8) Documentation updates
- Add a short `README` or update existing docs with:
  - Base URL + prefixes
  - Required `X-Api-Key` header
  - Example curl commands
