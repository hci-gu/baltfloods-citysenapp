package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		observations := core.NewCollection(core.CollectionTypeBase, "water_observations")
		observations.Fields = core.NewFieldsList(
			&core.NumberField{Name: "latitude"},
			&core.NumberField{Name: "longitude"},
			&core.TextField{Name: "observationType"},
			&core.FileField{Name: "photo", MaxSelect: 1},
			&core.NumberField{Name: "airTemp"},
			&core.NumberField{Name: "waterTemp"},
			&core.NumberField{Name: "depthOfView"},
			&core.TextField{Name: "algaeLevel"},
			&core.NumberField{Name: "waterPh"},
			&core.NumberField{Name: "turbidity"},
			&core.NumberField{Name: "dissolvedOxygen"},
			&core.NumberField{Name: "nitrate"},
			&core.NumberField{Name: "phosphate"},
			&core.TextField{Name: "identificationCode"},
			&core.BoolField{Name: "termsAccepted"},
			&core.BoolField{Name: "cc0Accepted"},
		)
		return app.Save(observations)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("water_observations")
		if err != nil || collection == nil {
			return nil
		}
		return app.Delete(collection)
	})
}
