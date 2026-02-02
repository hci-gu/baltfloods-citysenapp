package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection := core.NewCollection(core.CollectionTypeBase, "push_subscriptions")
		collection.Fields = core.NewFieldsList(
			&core.TextField{Name: "endpoint", Required: true},
			&core.TextField{Name: "p256dh"},
			&core.TextField{Name: "auth"},
			&core.NumberField{Name: "expirationTime"},
			&core.TextField{Name: "userAgent"},
		)

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("push_subscriptions")
		if err != nil || collection == nil {
			return nil
		}
		return app.Delete(collection)
	})
}
