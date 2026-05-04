package migrations

import (
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		observations, err := app.FindCollectionByNameOrId("observations")
		if err != nil || observations == nil {
			return nil
		}

		if observations.Fields.GetByName("created") == nil {
			observations.Fields.Add(&core.AutodateField{
				Name:     "created",
				OnCreate: true,
			})
			if err := app.Save(observations); err != nil {
				return err
			}
		}

		createdAt, err := types.ParseDateTime(time.Now().UTC())
		if err != nil {
			return err
		}

		records, err := app.FindRecordsByFilter("observations", "", "", 0, 0)
		if err != nil {
			return err
		}

		for _, record := range records {
			if !record.GetDateTime("created").IsZero() {
				continue
			}

			record.SetRaw("created", createdAt)
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

		if observations.Fields.GetByName("created") != nil {
			observations.Fields.RemoveByName("created")
		}

		return app.Save(observations)
	})
}
