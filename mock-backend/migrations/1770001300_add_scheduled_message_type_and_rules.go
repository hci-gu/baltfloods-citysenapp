package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("scheduled_messages")
		if err != nil || collection == nil {
			return nil
		}

		if collection.Fields.GetByName("type") == nil {
			collection.Fields.Add(&core.SelectField{
				Name:      "type",
				Values:    []string{"info", "warning"},
				MaxSelect: 1,
			})
		}

		adminRule := `@request.auth.type = "admin"`
		collection.CreateRule = &adminRule
		collection.UpdateRule = &adminRule
		collection.DeleteRule = &adminRule

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("scheduled_messages")
		if err != nil || collection == nil {
			return nil
		}

		if collection.Fields.GetByName("type") != nil {
			collection.Fields.RemoveByName("type")
		}
		collection.CreateRule = nil
		collection.UpdateRule = nil
		collection.DeleteRule = nil

		return app.Save(collection)
	})
}
