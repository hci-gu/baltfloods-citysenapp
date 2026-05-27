package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const settingsKey = "global"

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewCollection(core.CollectionTypeBase, "settings")
		collection.Fields = core.NewFieldsList(
			&core.TextField{Name: "key", Required: true},
			&core.BoolField{Name: "autoValidateObservations"},
		)
		collection.Indexes = append(
			collection.Indexes,
			"CREATE UNIQUE INDEX idx_settings_key ON settings (key)",
		)

		adminRule := `@request.auth.type = "admin"`
		collection.ListRule = &adminRule
		collection.ViewRule = &adminRule
		collection.CreateRule = &adminRule
		collection.UpdateRule = &adminRule
		collection.DeleteRule = nil

		if err := app.Save(collection); err != nil {
			return err
		}

		record := core.NewRecord(collection)
		record.Set("key", settingsKey)
		record.Set("autoValidateObservations", false)
		return app.Save(record)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("settings")
		if err != nil || collection == nil {
			return nil
		}

		return app.Delete(collection)
	})
}
