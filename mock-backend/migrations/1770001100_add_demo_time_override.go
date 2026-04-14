package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const demoTimeOverrideKey = "global"

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewCollection(core.CollectionTypeBase, "demo_time_overrides")
		collection.Fields = core.NewFieldsList(
			&core.TextField{Name: "key", Required: true},
			&core.DateField{Name: "currentTime"},
		)

		publicRule := ""
		adminRule := `@request.auth.type = "admin"`
		collection.ListRule = &publicRule
		collection.ViewRule = &publicRule
		collection.CreateRule = &adminRule
		collection.UpdateRule = &adminRule
		collection.DeleteRule = &adminRule

		if err := app.Save(collection); err != nil {
			return err
		}

		record := core.NewRecord(collection)
		record.Set("key", demoTimeOverrideKey)
		return app.Save(record)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("demo_time_overrides")
		if err != nil || collection == nil {
			return nil
		}

		return app.Delete(collection)
	})
}
