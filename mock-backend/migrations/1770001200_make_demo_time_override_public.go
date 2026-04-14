package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("demo_time_overrides")
		if err != nil || collection == nil {
			return nil
		}

		publicRule := ""
		adminRule := `@request.auth.type = "admin"`
		collection.ListRule = &publicRule
		collection.ViewRule = &publicRule
		collection.CreateRule = &adminRule
		collection.UpdateRule = &adminRule
		collection.DeleteRule = &adminRule

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("demo_time_overrides")
		if err != nil || collection == nil {
			return nil
		}

		collection.ListRule = nil
		collection.ViewRule = nil
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		return app.Save(collection)
	})
}
