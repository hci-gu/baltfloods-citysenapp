package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err == nil && users != nil {
			if users.Fields.GetByName("type") == nil {
				users.Fields.Add(&core.SelectField{
					Name:      "type",
					Values:    []string{"regular", "admin"},
					MaxSelect: 1,
				})
			}
			if err := app.Save(users); err != nil {
				return err
			}

			records, err := app.FindRecordsByFilter(users.Name, "", "", 0, 0)
			if err != nil {
				return err
			}
			for _, record := range records {
				if record.GetString("type") != "" {
					continue
				}
				record.Set("type", "regular")
				if err := app.Save(record); err != nil {
					return err
				}
			}
		}

		observations, err := app.FindCollectionByNameOrId("observations")
		if err == nil && observations != nil {
			visibleOrAdminRule := `visible = true || @request.auth.type = "admin"`
			adminDeleteRule := `@request.auth.type = "admin"`
			observations.ListRule = &visibleOrAdminRule
			observations.ViewRule = &visibleOrAdminRule
			observations.UpdateRule = &adminDeleteRule
			observations.DeleteRule = &adminDeleteRule

			if err := app.Save(observations); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		observations, err := app.FindCollectionByNameOrId("observations")
		if err == nil && observations != nil {
			observations.ListRule = nil
			observations.ViewRule = nil
			observations.UpdateRule = nil
			observations.DeleteRule = nil
			if err := app.Save(observations); err != nil {
				return err
			}
		}

		users, err := app.FindCollectionByNameOrId("users")
		if err == nil && users != nil {
			users.Fields.RemoveByName("type")
			if err := app.Save(users); err != nil {
				return err
			}
		}

		return nil
	})
}
