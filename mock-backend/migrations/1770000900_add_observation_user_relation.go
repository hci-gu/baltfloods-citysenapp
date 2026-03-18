package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		observations, err := app.FindCollectionByNameOrId("observations")
		if err != nil || observations == nil {
			return nil
		}

		users, err := app.FindCollectionByNameOrId("users")
		if err != nil || users == nil {
			return nil
		}

		if relationField, ok := observations.Fields.GetByName("user").(*core.RelationField); ok {
			relationField.CollectionId = users.Id
			relationField.MaxSelect = 1
		} else if observations.Fields.GetByName("user") == nil {
			observations.Fields.Add(&core.RelationField{
				Name:         "user",
				CollectionId: users.Id,
				MaxSelect:    1,
			})
		}

		return app.Save(observations)
	}, func(app core.App) error {
		observations, err := app.FindCollectionByNameOrId("observations")
		if err != nil || observations == nil {
			return nil
		}

		if observations.Fields.GetByName("user") != nil {
			observations.Fields.RemoveByName("user")
			return app.Save(observations)
		}

		return nil
	})
}
