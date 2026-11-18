package main

import (
	"net/http"
	"time"

	"app/demo"
	"app/sensordemo"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func registerAppSettingsHooks(app core.App, resolvers ...sensordemo.Resolver) {
	// Keep a single permanent record, also when using the superuser admin UI.
	app.OnRecordCreateRequest("app_settings").BindFunc(func(e *core.RecordRequestEvent) error {
		return apis.NewBadRequestError("Edit the existing app settings record instead.", nil)
	})
	app.OnRecordDeleteRequest("app_settings").BindFunc(func(e *core.RecordRequestEvent) error {
		return apis.NewBadRequestError("App settings cannot be deleted.", nil)
	})
	app.OnRecordUpdate("app_settings").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.Id != demo.SettingsID {
			return apis.NewBadRequestError("Invalid app settings record.", nil)
		}
		origin, err := demo.ParseOrigin(e.Record)
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		before, err := e.App.FindRecordById("app_settings", demo.SettingsID)
		if err != nil {
			return err
		}
		previousOrigin, err := demo.ParseOrigin(before)
		if err != nil {
			return err
		}
		configure := e.Record.GetBool("@demoConfigure")
		if origin == previousOrigin && !configure {
			return nil
		}
		expectedRevision := before.GetInt("revision")
		run, err := e.App.FindRecordById("demo_runs", sensordemo.RunID)
		if err != nil {
			return err
		}
		expectedRunRevision := run.GetInt("revision")
		if configure && e.Record.GetInt("@expectedRunRevision") != expectedRunRevision {
			return apis.NewApiError(http.StatusConflict, "Demo changed; refresh and try again.", nil)
		}
		placement, manual := e.Record.Get("@demoPlacement").(sensordemo.Placement)
		if !manual {
			if len(resolvers) > 0 {
				placement, err = resolvers[0](origin)
			} else {
				placement, err = sensordemo.Resolve(e.App, origin, configure)
			}
		}
		if err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}
		if err = placement.Validate(origin); err != nil {
			return apis.NewBadRequestError(err.Error(), nil)
		}

		originalApp := e.App
		defer func() { e.App = originalApp }()
		return originalApp.RunInTransaction(func(tx core.App) error {
			current, err := tx.FindRecordById("app_settings", demo.SettingsID)
			if err != nil {
				return err
			}
			previous, err := demo.ParseOrigin(current)
			if err != nil {
				return err
			}
			revision := current.GetInt("revision")
			currentRun, err := tx.FindRecordById("demo_runs", sensordemo.RunID)
			if err != nil {
				return err
			}
			if revision != expectedRevision || currentRun.GetInt("revision") != expectedRunRevision {
				return apis.NewApiError(http.StatusConflict, "Location or demo changed while finding water; refresh and try again.", nil)
			}
			e.Record.Set("origin", origin)
			e.Record.Set("revision", revision)
			if origin == previous && !configure {
				return nil
			}
			now := time.Now().UTC()
			if err := sensordemo.Remember(tx, origin, placement); err != nil {
				return err
			}
			if err := sensordemo.Generate(tx, origin, placement, now); err != nil {
				return err
			}
			if err := demo.Replace(tx, origin, now, now.UnixNano()); err != nil {
				return err
			}
			e.Record.Set("revision", revision+1)
			e.App = tx
			// The ordinary PocketBase record realtime event is deferred until commit.
			return e.Next()
		})
	})
}
