package migrations

import (
	"app/demo"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		observations, err := app.FindCollectionByNameOrId("observations")
		if err != nil {
			return err
		}
		observations.Fields.Add(&core.BoolField{Name: "demoGenerated"})
		// Ordinary admins may moderate observations, but cannot turn submissions
		// into disposable mock records (or remove that flag from mock records).
		rule := `@request.auth.type = "admin" && @request.body.demoGenerated:changed = false`
		observations.UpdateRule = &rule
		if err := app.Save(observations); err != nil {
			return err
		}
		records, err := app.FindRecordsByFilter(observations, "", "", 0, 0)
		if err != nil {
			return err
		}
		for _, record := range records {
			if demo.LegacyGenerated(record) {
				record.Set("demoGenerated", true)
				if err := app.Save(record); err != nil {
					return err
				}
			}
		}
		settings := core.NewBaseCollection("app_settings")
		public := ""
		settings.ListRule = &public
		settings.ViewRule = &public
		// Null write rules restrict writes to PocketBase superusers.
		settings.Fields.Add(&core.JSONField{Name: "origin", Required: true}, &core.NumberField{Name: "revision", OnlyInt: true})
		if err := app.Save(settings); err != nil {
			return err
		}
		record := core.NewRecord(settings)
		record.Id = demo.SettingsID
		record.Set("origin", demo.Origin{Latitude: defaultSeedCityLatitude, Longitude: defaultSeedCityLongitude})
		record.Set("revision", 1)
		return app.Save(record)
	}, func(app core.App) error {
		settings, err := app.FindCollectionByNameOrId("app_settings")
		if err != nil {
			return err
		}
		if err := app.Delete(settings); err != nil {
			return err
		}
		observations, err := app.FindCollectionByNameOrId("observations")
		if err != nil {
			return err
		}
		observations.Fields.RemoveByName("demoGenerated")
		rule := `@request.auth.type = "admin"`
		observations.UpdateRule = &rule
		return app.Save(observations)
	})
}
