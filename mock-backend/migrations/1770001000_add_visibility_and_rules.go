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

		if observations.Fields.GetByName("visible") == nil {
			observations.Fields.Add(&core.BoolField{Name: "visible"})
		}

		visibleOrAdminRule := `visible = true || @request.auth.type = "admin"`
		adminRule := `@request.auth.type = "admin"`
		observations.ListRule = &visibleOrAdminRule
		observations.ViewRule = &visibleOrAdminRule
		observations.UpdateRule = &adminRule
		observations.DeleteRule = &adminRule

		if err := app.Save(observations); err != nil {
			return err
		}

		records, err := app.FindRecordsByFilter("observations", "", "", 0, 0)
		if err != nil {
			return err
		}

		for _, record := range records {
			if record.GetBool("visible") {
				continue
			}

			record.Set("visible", true)
			if err := app.Save(record); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		observations, err := app.FindCollectionByNameOrId("observations")
		if err != nil || observations == nil {
			return nil
		}

		observations.ListRule = nil
		observations.ViewRule = nil
		observations.UpdateRule = nil
		observations.DeleteRule = nil

		if observations.Fields.GetByName("visible") != nil {
			observations.Fields.RemoveByName("visible")
		}

		return app.Save(observations)
	})
}
