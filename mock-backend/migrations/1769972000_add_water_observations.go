package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
		if err != nil {
			return err
		}

		collection.Fields.Add(
			&core.TextField{Name: "observationType"},
			&core.FileField{Name: "photo", MaxSelect: 1},
			&core.TextField{Name: "identificationCode"},
			&core.BoolField{Name: "termsAccepted"},
			&core.BoolField{Name: "cc0Accepted"},
		)

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
		if err != nil || collection == nil {
			return nil
		}

		for _, fieldName := range []string{
			"observationType",
			"photo",
			"identificationCode",
			"termsAccepted",
			"cc0Accepted",
		} {
			collection.Fields.RemoveByName(fieldName)
		}

		return app.Save(collection)
	})
}
