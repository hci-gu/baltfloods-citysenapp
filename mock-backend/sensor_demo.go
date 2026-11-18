package main

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"app/demo"
	"app/sensordemo"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func demoAdmin(e *core.RequestEvent) error {
	if e.Auth == nil {
		return apis.NewUnauthorizedError("Sign in to manage the demo.", nil)
	}
	if !e.HasSuperuserAuth() && e.Auth.GetString("type") != "admin" {
		return apis.NewForbiddenError("Administrator access required.", nil)
	}
	return nil
}

func registerSensorDemoRoutes(se *core.ServeEvent) {
	se.Router.GET("/api/demo/state", func(e *core.RequestEvent) error {
		e.Response.Header().Set("Cache-Control", "no-store")
		var result map[string]any
		err := e.App.RunInTransaction(func(tx core.App) error {
			sensor, err := tx.FindRecordById("sensors", sensordemo.SensorID)
			if err != nil {
				return err
			}
			run, err := tx.FindRecordById("demo_runs", sensordemo.RunID)
			if err != nil {
				return err
			}
			settings, err := tx.FindRecordById("app_settings", demo.SettingsID)
			if err != nil {
				return err
			}
			readings, err := tx.FindRecordsByFilter("sensor_readings", "sensor = {:sensor} && timestamp <= {:cursor}", "-timestamp", 1, 0, dbx.Params{"sensor": sensor.Id, "cursor": run.GetInt("cursor")})
			if err != nil {
				return err
			}
			var latest any
			if len(readings) > 0 {
				latest = map[string]any{"timestamp": readings[0].GetInt("timestamp"), "value": readings[0].GetFloat("value")}
			}
			result = map[string]any{"sensor": sensor, "run": run, "latest": latest, "settings": settings}
			return nil
		})
		if err != nil {
			return err
		}
		return e.JSON(http.StatusOK, result)
	})
	se.Router.GET("/api/sensors/{id}/history", func(e *core.RequestEvent) error {
		e.Response.Header().Set("Cache-Control", "no-store")
		if e.Request.PathValue("id") != sensordemo.SensorID {
			return apis.NewNotFoundError("Sensor not found.", nil)
		}
		q := e.Request.URL.Query()
		from, err := strconv.ParseInt(q.Get("from"), 10, 64)
		if err != nil {
			return apis.NewBadRequestError("from must be a Unix timestamp in seconds.", nil)
		}
		to, err := strconv.ParseInt(q.Get("to"), 10, 64)
		if err != nil || to < from || to-from > 4*366*86400 {
			return apis.NewBadRequestError("Choose a history range of at most four years.", nil)
		}
		rev, err := strconv.Atoi(q.Get("revision"))
		if err != nil {
			return apis.NewBadRequestError("revision is required.", nil)
		}
		result := []map[string]any{}
		err = e.App.RunInTransaction(func(tx core.App) error {
			run, err := tx.FindRecordById("demo_runs", sensordemo.RunID)
			if err != nil {
				return err
			}
			if run.GetInt("revision") != rev {
				return apis.NewApiError(http.StatusConflict, "Demo changed; refresh the sensor.", nil)
			}
			if cursor := int64(run.GetInt("cursor")); to > cursor {
				to = cursor
			}
			rows, err := tx.FindRecordsByFilter("sensor_readings", "sensor = {:sensor} && timestamp >= {:from} && timestamp <= {:to}", "timestamp", 5000, 0, dbx.Params{"sensor": sensordemo.SensorID, "from": from, "to": to})
			if err != nil {
				return err
			}
			for _, r := range rows {
				result = append(result, map[string]any{"timestamp": r.GetInt("timestamp"), "value": r.GetFloat("value")})
			}
			return nil
		})
		if err != nil {
			return err
		}
		return e.JSON(http.StatusOK, result)
	})
	se.Router.POST("/api/demo/action", func(e *core.RequestEvent) error {
		if err := demoAdmin(e); err != nil {
			return err
		}
		var body struct {
			Stage    string `json:"stage"`
			Revision int    `json:"revision"`
		}
		if err := e.BindBody(&body); err != nil {
			return apis.NewBadRequestError("Invalid action.", err)
		}
		var err error
		if body.Stage == "reset" {
			err = e.App.RunInTransaction(func(tx core.App) error {
				run, err := tx.FindRecordById("demo_runs", sensordemo.RunID)
				if err != nil {
					return err
				}
				if run.GetInt("revision") != body.Revision {
					return fmt.Errorf("demo changed in another session; refresh and try again")
				}
				sensor, err := tx.FindRecordById("sensors", sensordemo.SensorID)
				if err != nil {
					return err
				}
				if !sensor.GetBool("ready") {
					return fmt.Errorf("place the demo sensor first")
				}
				var p sensordemo.Placement
				if err = sensor.UnmarshalJSONField("placement", &p); err != nil {
					return err
				}
				settings, err := tx.FindRecordById("app_settings", demo.SettingsID)
				if err != nil {
					return err
				}
				origin, err := demo.ParseOrigin(settings)
				if err != nil {
					return err
				}
				now := time.Now().UTC()
				if err := sensordemo.Generate(tx, origin, p, now); err != nil {
					return err
				}
				return demo.Replace(tx, origin, now, now.UnixNano())
			})
		} else {
			err = sensordemo.Advance(e.App, body.Stage, body.Revision)
		}
		if err != nil {
			return apis.NewApiError(http.StatusConflict, err.Error(), nil)
		}
		if body.Stage == "reset" {
			broadcastObservationRefresh(e.App, "update")
		}
		return e.JSON(http.StatusOK, map[string]bool{"ok": true})
	})
	se.Router.POST("/api/demo/location", func(e *core.RequestEvent) error {
		if err := demoAdmin(e); err != nil {
			return err
		}
		var body struct {
			Origin      demo.Origin           `json:"origin"`
			Placement   *sensordemo.Placement `json:"placement"`
			Revision    int                   `json:"revision"`
			RunRevision int                   `json:"runRevision"`
		}
		if err := e.BindBody(&body); err != nil {
			return apis.NewBadRequestError("Invalid location.", err)
		}
		settings, err := e.App.FindRecordById("app_settings", demo.SettingsID)
		if err != nil {
			return err
		}
		if settings.GetInt("revision") != body.Revision {
			return apis.NewApiError(http.StatusConflict, "Location changed; refresh and try again.", nil)
		}
		settings.Set("origin", body.Origin)
		if body.Placement != nil {
			body.Placement.Source = "manual"
			body.Placement.FeatureID = ""
			if body.Placement.Name == "" {
				body.Placement.Name = "Selected water-side location"
			}
			settings.Set("@demoPlacement", *body.Placement)
		}
		settings.Set("@demoConfigure", true)
		settings.Set("@expectedRunRevision", body.RunRevision)
		if err = e.App.Save(settings); err != nil {
			return err
		}
		return e.JSON(http.StatusOK, map[string]bool{"ok": true})
	})
}

// Provision only an unplaced sensor. A simultaneous admin edit wins over a
// delayed lookup; no network request is made while holding a database transaction.
func initializeSensorDemo(app core.App) {
	sensor, err := app.FindRecordById("sensors", sensordemo.SensorID)
	if err != nil || sensor.GetBool("ready") {
		return
	}
	settings, err := app.FindRecordById("app_settings", demo.SettingsID)
	if err != nil {
		return
	}
	origin, err := demo.ParseOrigin(settings)
	if err != nil {
		return
	}
	revision := settings.GetInt("revision")
	p, lookupErr := sensordemo.Resolve(app, origin)
	_ = app.RunInTransaction(func(tx core.App) error {
		current, err := tx.FindRecordById("app_settings", demo.SettingsID)
		if err != nil {
			return err
		}
		sensor, err := tx.FindRecordById("sensors", sensordemo.SensorID)
		if err != nil {
			return err
		}
		if current.GetInt("revision") != revision || sensor.GetBool("ready") {
			return nil
		}
		if lookupErr != nil {
			run, err := tx.FindRecordById("demo_runs", sensordemo.RunID)
			if err != nil {
				return err
			}
			run.Set("placementError", lookupErr.Error())
			run.Set("revision", run.GetInt("revision")+1)
			return tx.Save(run)
		}
		if err = sensordemo.Remember(tx, origin, p); err != nil {
			return err
		}
		return sensordemo.Generate(tx, origin, p, time.Now())
	})
}

func registerSensorDemoGuards(app core.App) {
	for _, collection := range []string{"sensors", "sensor_readings", "demo_runs", "sensor_placements"} {
		reject := func(e *core.RecordRequestEvent) error {
			return apis.NewBadRequestError("Use the demo controls or /api/demo endpoints to change the simulated sensor.", nil)
		}
		app.OnRecordCreateRequest(collection).BindFunc(reject)
		app.OnRecordUpdateRequest(collection).BindFunc(reject)
		app.OnRecordDeleteRequest(collection).BindFunc(reject)
	}
}
