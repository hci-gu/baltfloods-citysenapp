package main

import (
	"app/demo"
	"app/sensordemo"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

func settingsTestApp(t *testing.T, resolvers ...sensordemo.Resolver) core.App {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	resolver := func(o demo.Origin) (sensordemo.Placement, error) {
		return sensordemo.Placement{Latitude: o.Latitude, Longitude: o.Longitude, Name: "Test river", Source: "test"}, nil
	}
	if len(resolvers) > 0 {
		resolver = resolvers[0]
	}
	registerAppSettingsHooks(app, resolver)
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		app.OnTerminate().Trigger(&core.TerminateEvent{App: app})
		app.ResetBootstrapState()
		// PocketBase deletes record file directories in background workers.
		// Sparse generation finishes sooner, so these can still be winding
		// down when testing.TempDir starts removing the database directory.
		deadline := time.Now().Add(2 * time.Second)
		for {
			err := os.RemoveAll(app.DataDir())
			if err == nil {
				break
			}
			if time.Now().After(deadline) {
				t.Fatalf("remove test data directory: %v", err)
			}
			time.Sleep(10 * time.Millisecond)
		}
	})
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	return app
}

func settingsRecord(t *testing.T, app core.App) *core.Record {
	t.Helper()
	record, err := app.FindRecordById("app_settings", demo.SettingsID)
	if err != nil {
		t.Fatal(err)
	}
	return record
}

func mockRecords(t *testing.T, app core.App) []*core.Record {
	t.Helper()
	records, err := app.FindRecordsByFilter("observations", "demoGenerated = true", "id", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	return records
}

func TestRelocation(t *testing.T) {
	app := settingsTestApp(t)
	legacy := mockRecords(t, app)
	if len(legacy) < 580 {
		t.Fatalf("legacy seeds were not marked: %d", len(legacy))
	}
	// A genuine observation remains even if someone gives it a seed-like name.
	collection, _ := app.FindCollectionByNameOrId("observations")
	genuine := core.NewRecord(collection)
	genuine.Load(map[string]any{"name": "Seed Overflow personal report", "type": "water_overflow", "latitude": 61, "longitude": 28, "data": map[string]any{"observationType": "water_overflow"}, "visible": true})
	if err := app.Save(genuine); err != nil {
		t.Fatal(err)
	}

	for i, origin := range []demo.Origin{{59.4377, 24.7330}, {-33.8688, 151.2093}, {0, 0}, {89.999, 179.999}} {
		record := settingsRecord(t, app)
		record.Set("origin", origin)
		record.Set("revision", 999) // Caller cannot control revision.
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
		saved := settingsRecord(t, app)
		if saved.GetInt("revision") != i+2 {
			t.Fatalf("wrong revision: %d", saved.GetInt("revision"))
		}
		generated := mockRecords(t, app)
		if len(generated) != 30 {
			t.Fatalf("got %d generated records", len(generated))
		}
		recent := map[string]int{}
		for _, point := range generated {
			if demo.IsResetRecord(point) {
				t.Fatal("transient reset flag was persisted, which would suppress moderation refreshes")
			}
			lat, lon := point.GetFloat("latitude"), point.GetFloat("longitude")
			if math.Abs(lat) > 90 || math.Abs(lon) > 180 {
				t.Fatalf("invalid coordinate: %v %v", lat, lon)
			}
			if distanceKm(origin, demo.Origin{lat, lon}) > 5 {
				t.Fatalf("point outside origin radius: %v", point)
			}
			if point.GetInt("dataRetrievedTimestamp") >= int(time.Now().Add(-30*24*time.Hour).Unix()) {
				recent[point.GetString("type")]++
			}
		}
		if recent["storm_water"] != 0 || recent["waterbag_testkit"] != 0 || recent["water_overflow"] != 1 {
			t.Fatalf("want one current observation plus the simulated sensor, got %v", recent)
		}
		if _, err := app.FindRecordById("observations", genuine.Id); err != nil {
			t.Fatal("genuine observation removed", err)
		}
		// Repeating an origin is a true no-op, including record IDs and revision.
		if err := app.Save(saved); err != nil {
			t.Fatal(err)
		}
		same := mockRecords(t, app)
		if settingsRecord(t, app).GetInt("revision") != i+2 || same[0].Id != generated[0].Id {
			t.Fatal("same-origin save regenerated data")
		}
	}
	for _, old := range legacy {
		if _, err := app.FindRecordById("observations", old.Id); err == nil {
			t.Fatal("legacy generated observation survived reset")
		}
	}
}

func TestRelocationRollbackAndValidation(t *testing.T) {
	app := settingsTestApp(t)
	original := settingsRecord(t, app)
	before := mockRecords(t, app)
	for _, value := range []any{map[string]any{"latitude": 10}, map[string]any{"latitude": 91, "longitude": 0}, map[string]any{"latitude": 0, "longitude": 181}, map[string]any{"latitude": "10", "longitude": 20}, nil} {
		record := settingsRecord(t, app)
		record.Set("origin", value)
		if err := app.Save(record); err == nil {
			t.Fatalf("accepted invalid origin: %v", value)
		}
	}
	count, successes := 0, 0
	resetCreates := 0
	app.OnRecordAfterCreateSuccess("observations").BindFunc(func(e *core.RecordEvent) error {
		if demo.IsResetRecord(e.Record) {
			resetCreates++
		}
		return e.Next()
	})
	app.OnRecordAfterUpdateSuccess("app_settings").BindFunc(func(e *core.RecordEvent) error { successes++; return e.Next() })
	app.OnRecordCreate("observations").Bind(&hook.Handler[*core.RecordEvent]{Id: "fail-generation", Func: func(e *core.RecordEvent) error {
		count++
		if count == 30 {
			return errors.New("injected failure during generation")
		}
		return e.Next()
	}})
	record := settingsRecord(t, app)
	record.Set("origin", demo.Origin{40, -74})
	if err := app.Save(record); err == nil {
		t.Fatal("expected generation failure")
	}
	after := mockRecords(t, app)
	saved := settingsRecord(t, app)
	if saved.GetString("origin") != original.GetString("origin") || saved.GetInt("revision") != 1 || len(after) != len(before) || after[0].Id != before[0].Id || successes != 0 {
		t.Fatal("failed reset changed the database or emitted success")
	}
	sensor, _ := app.FindRecordById("sensors", sensordemo.SensorID)
	run, _ := app.FindRecordById("demo_runs", sensordemo.RunID)
	readingCount, _ := app.CountRecords("sensor_readings")
	cacheCount, _ := app.CountRecords("sensor_placements")
	if sensor.GetBool("ready") || run.GetInt("revision") != 1 || readingCount != 0 || cacheCount != 0 {
		t.Fatal("failed observation generation did not roll back sensor history and placement")
	}
	app.OnRecordCreate("observations").Unbind("fail-generation")
	record = settingsRecord(t, app)
	record.Set("origin", demo.Origin{40, -74})
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if resetCreates != 30 {
		t.Fatalf("bulk reset records were not flagged: %d", resetCreates)
	}
	if successes != 1 {
		t.Fatalf("expected one completed settings event, got %d", successes)
	}
}

func TestConcurrentRelocations(t *testing.T) {
	app := settingsTestApp(t)
	records := []*core.Record{settingsRecord(t, app), settingsRecord(t, app)}
	origins := []demo.Origin{{59.4, 24.7}, {-33.8, 151.2}}
	var wg sync.WaitGroup
	errors := make(chan error, 2)
	for i, record := range records {
		wg.Add(1)
		go func(record *core.Record, origin demo.Origin) {
			defer wg.Done()
			record.Set("origin", origin)
			errors <- app.Save(record)
		}(record, origins[i])
	}
	wg.Wait()
	close(errors)
	successes := 0
	for err := range errors {
		if err == nil {
			successes++
		}
	}
	saved := settingsRecord(t, app)
	if successes < 1 || saved.GetInt("revision") != 1+successes {
		t.Fatal("concurrent resets did not reject or serialize superseded work")
	}
	origin, _ := demo.ParseOrigin(saved)
	for _, record := range mockRecords(t, app) {
		if distanceKm(origin, demo.Origin{record.GetFloat("latitude"), record.GetFloat("longitude")}) > 5 {
			t.Fatal("mixed generations")
		}
	}
}

func TestSettingsAPI(t *testing.T) {
	app := settingsTestApp(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	superusers, _ := app.FindCollectionByNameOrId("_superusers")
	admin := core.NewRecord(superusers)
	admin.Set("email", "settings@example.test")
	admin.SetPassword("test-password-12345")
	if err := app.Save(admin); err != nil {
		t.Fatal(err)
	}
	token, err := admin.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	users, _ := app.FindCollectionByNameOrId("users")
	user := core.NewRecord(users)
	user.Set("email", "user@example.test")
	user.Set("type", "admin")
	user.SetPassword("test-password-12345")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	userToken, _ := user.NewAuthToken()
	path := "/api/collections/app_settings/records/" + demo.SettingsID
	request := func(method, url, body, auth string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, url, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, req)
		return res
	}
	if res := request(http.MethodGet, path, "", ""); res.Code != 200 {
		t.Fatal(res.Code, res.Body.String())
	}
	body := `{"origin":{"latitude":59.4377,"longitude":24.7330}}`
	for _, auth := range []string{"", userToken} {
		if res := request(http.MethodPatch, path, body, auth); res.Code < 400 {
			t.Fatal("unauthorized reset", res.Body.String())
		}
	}
	generated := mockRecords(t, app)
	observationPath := "/api/collections/observations/records/" + generated[0].Id
	if res := request(http.MethodPatch, observationPath, `{"visible":false}`, userToken); res.Code != 200 {
		t.Fatal("admin could not moderate generated observation", res.Code, res.Body.String())
	}
	if res := request(http.MethodPatch, observationPath, `{"demoGenerated":false}`, userToken); res.Code < 400 {
		t.Fatal("ordinary admin changed generated provenance")
	}
	res := request(http.MethodPatch, path, body, token)
	if res.Code != 200 {
		t.Fatal(res.Code, res.Body.String())
	}
	var saved struct {
		Revision int `json:"revision"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &saved); err != nil || saved.Revision != 2 {
		t.Fatal("incorrect API revision", res.Body.String())
	}
	if res := request(http.MethodPost, "/api/collections/app_settings/records", body, token); res.Code != 400 {
		t.Fatal("allowed second settings record", res.Code)
	}
	if res := request(http.MethodDelete, path, "", token); res.Code != 400 {
		t.Fatal("allowed settings deletion", res.Code)
	}
}

func distanceKm(a, b demo.Origin) float64 {
	lat1, lat2 := a.Latitude*math.Pi/180, b.Latitude*math.Pi/180
	dlat, dlon := lat2-lat1, (b.Longitude-a.Longitude)*math.Pi/180
	h := math.Pow(math.Sin(dlat/2), 2) + math.Cos(lat1)*math.Cos(lat2)*math.Pow(math.Sin(dlon/2), 2)
	return 6371 * 2 * math.Asin(math.Sqrt(math.Min(1, h)))
}

func TestSupersededWaterLookupCannotMoveApp(t *testing.T) {
	started, release := make(chan struct{}), make(chan struct{})
	app := settingsTestApp(t, func(o demo.Origin) (sensordemo.Placement, error) {
		if o.Latitude == 59 {
			close(started)
			<-release
		}
		return sensordemo.Placement{Latitude: o.Latitude, Longitude: o.Longitude, Source: "test"}, nil
	})
	first := settingsRecord(t, app)
	first.Set("origin", demo.Origin{Latitude: 59, Longitude: 24})
	result := make(chan error, 1)
	go func() { result <- app.Save(first) }()
	<-started
	second := settingsRecord(t, app)
	second.Set("origin", demo.Origin{Latitude: 57, Longitude: 12})
	if err := app.Save(second); err != nil {
		close(release)
		t.Fatal(err)
	}
	close(release)
	if err := <-result; err == nil {
		t.Fatal("superseded lookup overwrote newer location")
	}
	final, _ := demo.ParseOrigin(settingsRecord(t, app))
	sensor, _ := app.FindRecordById("sensors", sensordemo.SensorID)
	if final.Latitude != 57 || sensor.GetFloat("latitude") != 57 {
		t.Fatal("mixed location generations")
	}
	cached, err := sensordemo.Resolve(app, final)
	if err != nil || cached.Latitude != 57 || cached.Source != "test" {
		t.Fatal("successful placement was not cached")
	}
}

func TestFailedWaterLookupKeepsCurrentApp(t *testing.T) {
	app := settingsTestApp(t, func(o demo.Origin) (sensordemo.Placement, error) {
		return sensordemo.Placement{}, errors.New("water lookup unavailable")
	})
	before := settingsRecord(t, app).GetString("origin")
	id := mockRecords(t, app)[0].Id
	settings := settingsRecord(t, app)
	settings.Set("origin", demo.Origin{Latitude: 59, Longitude: 24})
	if err := app.Save(settings); err == nil {
		t.Fatal("failed lookup saved location")
	}
	if settingsRecord(t, app).GetString("origin") != before || mockRecords(t, app)[0].Id != id {
		t.Fatal("lookup failure reset data")
	}
}
