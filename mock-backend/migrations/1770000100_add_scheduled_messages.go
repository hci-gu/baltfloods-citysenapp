package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewCollection(core.CollectionTypeBase, "scheduled_messages")
		collection.Fields = core.NewFieldsList(
			&core.TextField{Name: "name", Required: true},
			&core.TextField{Name: "title", Required: true},
			&core.EditorField{Name: "content", Required: true},
			&core.DateField{Name: "start", Required: true},
			&core.DateField{Name: "end", Required: true},
		)

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("scheduled_messages")
		if err != nil || collection == nil {
			return nil
		}

		return app.Delete(collection)
	})
}
