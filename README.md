# Citizen Web App

### How do I get set up?

#### Prerequisites

1. Use Node `22.23.1` and npm `10.9.0`
2. `npm install`
3. `npm run serve` to serve the Angular app on `localhost:4200` without service workers

#### Use of service workers

Service workers augment the traditional web deployment model and empower applications to deliver a user experience with the reliability and performance on par with code that is written to run on your operating system and hardware. Adding a service worker to an Angular application is one of the steps for turning an application into a Progressive Web App (also known as a PWA).
[Continue reading](https://angular.io/guide/service-worker-intro)...

In order to deliver a good experience, we must ensure the app also works without service workers.

For service workers to be registered, the application must be accessed over HTTPS or accessed via `localhost`

1. `npm run watch` to watch and build the project on change or just `npm run build` to build once
2. `npm run start` to start the `http-server`
3. Access the app on `localhost:8080`

### Project structure

We adhere to the structure as described in [this article](https://www.devbyseb.com/article/best-practices-for-angular-app-development-folder-structure-naming-lazy-loading-and-more)

- `src/app` folder: This folder contains all the application-specific code.

- `src/app/core` folder: This folder contains the code that is shared across the entire application, such as services, models, guards, and interceptors. The `core.module.ts` file is responsible for importing and exporting these shared items.

- `src/app/modules` folder: This folder contains the feature modules of the application. Each feature module is organized into its own folder, which contains all the components, services, and routing information for that feature. The naming convention for feature modules is typically [feature-name].module.ts. Use lazy loading to load modules on-demand, improving the performance of the application and reducing the initial loading time.

- `src/app/shared` folder: This folder contains shared components, directives, and pipes that are used across the application. The `shared.module.ts` file is responsible for importing and exporting shared items, for instance `TranslateModule.forChild()`.

- `src/assets` folder: This folder contains static files used in the application, such as images, fonts, and stylesheets. The config.json file can also be stored here to hold any configuration data.

### Theming

We use [PrimeNG](https://primeng.org/theming) as UI suite for this project. Theming is also handled by PrimeNG and can be changed by the following steps:

- Navigate to `src/assets/themes/mytheme` and make your changes
- Run `npm run theme` to generate the `theme.css` file (which is already imported in `/styles.sass`)

### Map location and mock data

The map origin is read at runtime from PocketBase's `app_settings` collection.
Edit the existing record's `origin` JSON field (latitude and longitude) in the
PocketBase admin UI, or update it through the API with a superuser token.
Saving a different origin regenerates the demo observations around it and
restarts connected apps at the map. Genuine submissions and login sessions
are preserved. The “my location” action still focuses on the user's GPS position.

Deploy the backend migration before the frontend. The initial migrated origin
matches the historical backend seeds; set your desired origin after deployment.
See [API documentation](mock-backend/API.md#runtime-map-origin-and-demo-reset)
for the request format, reset scope, and deployment configuration.

The backend deployment probes the public
`/api/collections/app_settings/records/appsettings0001` endpoint. PocketBase's
`/api/health` can return success even when database-backed requests fail, so it
is insufficient for readiness or liveness. Startup allows up to five minutes
for migrations; persistent settings-read failures trigger a container restart.
The deployment uses `Recreate` to keep a single backend process on the SQLite
volume during updates.

### Flood demonstration

Workshop links can provide a scenario position, for example
`/?lat=53.252258&lon=14.545360`. A valid latitude/longitude pair centres the map,
places the location marker, prefills the observation form, and takes precedence
over GPS and map panning for quick photo observations. The full form still lets
participants choose a different submission position. Sidebar links preserve the
scenario parameters, including when the destination is reloaded. The scenario
is held only for the current page session; opening the app without these
parameters starts the normal flow. Missing, non-numeric, and out-of-range pairs
are ignored. Backend demo origins and other participants are not changed.

The administrator dashboard now has a PocketBase-owned simulated water-level
sensor with three years of generated history. Use **Trigger flooding** to create
a red simulated flood warning, **Back to normal** to clear it, or **Reset demo**
to regenerate the scenario and a small observation history. Reset and location
changes leave two demo points in the default 30-day map view: the simulated
sensor and one overflow observation. Another 29 demo observations remain in
the history. User accounts, submissions, and photos are preserved. Stage changes
are shared across open clients and do not change real observation timestamps.
Intoto is optional and disabled by default.

The backend automatically finds a nearby river or shoreline when the map origin
changes. If lookup fails, the previous location stays intact; use **Change
location / place sensor** on the administrator dashboard to choose a water-side
point manually. Deploy the backend migrations before the frontend. See the
[owned sensor API and test guide](mock-backend/API.md#owned-flood-sensor-demo).
