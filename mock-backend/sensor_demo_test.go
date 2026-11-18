package main

import (
	"app/demo"
	"app/sensordemo"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

func sensorHandler(t *testing.T, app core.App) http.Handler {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	registerSensorDemoRoutes(&core.ServeEvent{App: app, Router: router})
	h, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return h
}
func demoRequest(h http.Handler, method, path, body, token string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func demoUser(t *testing.T, app core.App, role string) string {
	t.Helper()
	c, _ := app.FindCollectionByNameOrId("users")
	r := core.NewRecord(c)
	r.Set("email", role+"@example.test")
	r.Set("type", role)
	r.SetPassword("test-password-12345")
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
	token, err := r.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func TestOwnedSensorDemo(t *testing.T) {
	app := settingsTestApp(t)
	registerSensorDemoGuards(app)
	settings := settingsRecord(t, app)
	origin, _ := demo.ParseOrigin(settings)
	now := time.Date(2026, 9, 21, 12, 0, 0, 0, time.UTC)
	p := sensordemo.Placement{Latitude: origin.Latitude, Longitude: origin.Longitude, Name: "Test river", Source: "test"}
	if err := app.RunInTransaction(func(tx core.App) error { return sensordemo.Generate(tx, origin, p, now) }); err != nil {
		t.Fatal(err)
	}
	h := sensorHandler(t, app)
	admin := demoUser(t, app, "admin")
	regular := demoUser(t, app, "regular")
	user, err := app.FindFirstRecordByData("users", "type", "regular")
	if err != nil {
		t.Fatal(err)
	}
	collection, _ := app.FindCollectionByNameOrId("observations")
	genuine := core.NewRecord(collection)
	photo, err := filesystem.NewFileFromBytes([]byte("uploaded photo"), "photo.jpg")
	if err != nil {
		t.Fatal(err)
	}
	genuine.Load(map[string]any{"name": "Personal observation", "type": "water_overflow", "user": user.Id, "visible": true, "photo": photo})
	if err := app.Save(genuine); err != nil {
		t.Fatal(err)
	}
	photoPath := genuine.BaseFilesPath() + "/" + genuine.GetString("photo")
	run, _ := app.FindRecordById("demo_runs", sensordemo.RunID)
	rev := run.GetInt("revision")
	anchor := run.GetInt("anchor")
	count, _ := app.CountRecords("sensor_readings")
	if count < 2000 {
		t.Fatalf("missing history: %d", count)
	}
	state := demoRequest(h, "GET", "/api/demo/state", "", "")
	if state.Code != 200 {
		t.Fatal(state.Body.String())
	}
	var stateData struct {
		Latest struct {
			Value     float64 `json:"value"`
			Timestamp int     `json:"timestamp"`
		} `json:"latest"`
	}
	json.Unmarshal(state.Body.Bytes(), &stateData)
	if stateData.Latest.Value != 1 || stateData.Latest.Timestamp != anchor {
		t.Fatal("baseline includes future readings")
	}
	historyURL := fmt.Sprintf("/api/sensors/%s/history?from=%d&to=%d&revision=%d", sensordemo.SensorID, anchor-4*86400, anchor+4*86400, rev)
	history := demoRequest(h, "GET", historyURL, "", "")
	if history.Code != 200 {
		t.Fatal(history.Body.String())
	}
	var rows []struct {
		Timestamp int     `json:"timestamp"`
		Value     float64 `json:"value"`
	}
	json.Unmarshal(history.Body.Bytes(), &rows)
	for _, r := range rows {
		if r.Timestamp > anchor {
			t.Fatal("future scenario exposed")
		}
	}
	if w := demoRequest(h, "GET", "/api/collections/sensor_readings/records", "", ""); w.Code == 200 {
		t.Fatal("raw future history is public")
	}
	for _, token := range []string{"", regular} {
		w := demoRequest(h, "POST", "/api/demo/action", fmt.Sprintf(`{"stage":"peak","revision":%d}`, rev), token)
		if w.Code != 401 && w.Code != 403 {
			t.Fatalf("unprivileged action: %d", w.Code)
		}
	}
	before := mockRecords(t, app)[0].Id
	for _, stage := range []string{"rising", "warning", "peak", "recovery", "normal", "reset"} {
		w := demoRequest(h, "POST", "/api/demo/action", fmt.Sprintf(`{"stage":%q,"revision":%d}`, stage, rev), admin)
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", stage, w.Code, w.Body.String())
		}
		run, _ = app.FindRecordById("demo_runs", sensordemo.RunID)
		rev = run.GetInt("revision")
		current := demoRequest(h, "GET", "/api/demo/state", "", "")
		json.Unmarshal(current.Body.Bytes(), &stateData)
		want := map[string]float64{"rising": 1.7, "warning": 2.3, "peak": 3.2, "recovery": 1, "normal": 1, "reset": 1}[stage]
		if stateData.Latest.Value != want {
			t.Fatalf("%s value=%f", stage, stateData.Latest.Value)
		}
		if stage != "reset" && mockRecords(t, app)[0].Id != before {
			t.Fatal("changing sensor stage replaced observations")
		}
	}
	generated := mockRecords(t, app)
	if len(generated) != 30 {
		t.Fatalf("reset should leave a small observation history, got %d", len(generated))
	}
	currentMarkers := 1 // The ready simulated sensor is the other current marker.
	for _, record := range generated {
		if record.GetBool("visible") && record.GetInt("dataRetrievedTimestamp") >= int(time.Now().Add(-30*24*time.Hour).Unix()) {
			currentMarkers++
		}
	}
	if currentMarkers != 2 {
		t.Fatalf("want two demo markers in the default 30-day view, got %d", currentMarkers)
	}
	if users, err := app.CountRecords("users"); err != nil || users != 2 {
		t.Fatalf("reset changed user accounts: count=%d err=%v", users, err)
	}
	if saved, err := app.FindRecordById("observations", genuine.Id); err != nil || saved.GetString("user") != user.Id {
		t.Fatalf("reset changed the user submission: %v", err)
	}
	storage, err := app.NewFilesystem()
	if err != nil {
		t.Fatal(err)
	}
	defer storage.Close()
	reader, err := storage.GetReader(photoPath)
	if err != nil {
		t.Fatalf("reset deleted an uploaded photo: %v", err)
	}
	reader.Close()
	if w := demoRequest(h, "GET", historyURL, "", ""); w.Code != 409 {
		t.Fatalf("stale chart accepted: %d", w.Code)
	}
	if w := demoRequest(h, "POST", "/api/demo/action", `{"stage":"peak","revision":1}`, admin); w.Code != 409 {
		t.Fatal("stale command accepted")
	}
	if w := demoRequest(h, "POST", "/api/demo/action", fmt.Sprintf(`{"stage":"invalid","revision":%d}`, rev), admin); w.Code != 409 {
		t.Fatal("invalid stage accepted")
	}
}

func TestManualRelocationAndValidation(t *testing.T) {
	app := settingsTestApp(t)
	h := sensorHandler(t, app)
	admin := demoUser(t, app, "admin")
	settings := settingsRecord(t, app)
	before := settings.GetString("origin")
	body := `{"origin":{"latitude":57.7,"longitude":11.97},"placement":{"latitude":58.7,"longitude":11.97},"revision":1,"runRevision":1}`
	w := demoRequest(h, "POST", "/api/demo/location", body, admin)
	if w.Code != 400 {
		t.Fatalf("invalid sensor: %d %s", w.Code, w.Body.String())
	}
	if settingsRecord(t, app).GetString("origin") != before {
		t.Fatal("invalid placement moved origin")
	}
	body = strings.Replace(body, "58.7", "57.701", 1)
	w = demoRequest(h, "POST", "/api/demo/location", body, admin)
	if w.Code != 200 {
		t.Fatalf("manual placement: %d %s", w.Code, w.Body.String())
	}
	sensor, _ := app.FindRecordById("sensors", sensordemo.SensorID)
	run, _ := app.FindRecordById("demo_runs", sensordemo.RunID)
	if !sensor.GetBool("ready") || sensor.GetFloat("latitude") != 57.701 || run.GetString("stage") != "normal" || settingsRecord(t, app).GetInt("revision") != 2 {
		t.Fatal("incomplete location reset")
	}
	var p sensordemo.Placement
	sensor.UnmarshalJSONField("placement", &p)
	if p.Source != "manual" {
		t.Fatal("manual provenance missing")
	}
	if w = demoRequest(h, "POST", "/api/demo/location", body, admin); w.Code != 409 {
		t.Fatal("stale location command accepted")
	}
}
