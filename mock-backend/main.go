package main

import (
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "app/migrations"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.OnRecordCreateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		if !e.HasSuperuserAuth() {
			e.Record.Set("type", "regular")
		}
		return e.Next()
	})

	app.OnRecordUpdateRequest("users").BindFunc(func(e *core.RecordRequestEvent) error {
		if !e.HasSuperuserAuth() {
			userType := "regular"
			if e.Auth != nil {
				if existingType := e.Auth.GetString("type"); existingType != "" {
					userType = existingType
				}
			}
			e.Record.Set("type", userType)
		}
		return e.Next()
	})

	app.OnRecordCreateRequest("observations").BindFunc(func(e *core.RecordRequestEvent) error {
		ensureObservationImageURL(e.Record)
		return e.Next()
	})

	app.OnRecordUpdateRequest("observations").BindFunc(func(e *core.RecordRequestEvent) error {
		ensureObservationImageURL(e.Record)
		return e.Next()
	})

	app.OnRecordAfterCreateSuccess("observations").BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		broadcastObservationRefresh(e.App, "create")
		return nil
	})

	app.OnRecordAfterUpdateSuccess("observations").BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		broadcastObservationRefresh(e.App, "update")
		return nil
	})

	app.OnRecordAfterDeleteSuccess("observations").BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		broadcastObservationRefresh(e.App, "delete")
		return nil
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := backfillObservationImageURLs(se.App); err != nil {
			log.Printf("failed to backfill observation image URLs: %v", err)
		}

		streetAIKey := os.Getenv("STREET_AI_API_KEY")

		registerStreetAIRoutes(se, streetAIKey)
		registerServiceRoutes(se)
		registerObservationRoutes(se)
		registerMessageRoutes(se)
		registerPushRoutes(se)

		// serves static files from the provided public dir (if exists)
		se.Router.GET("/{path...}", apis.Static(os.DirFS("./pb_public"), false))

		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
