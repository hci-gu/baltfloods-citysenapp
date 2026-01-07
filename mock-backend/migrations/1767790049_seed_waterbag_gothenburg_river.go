package migrations

import (
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
		if err != nil {
			return err
		}

		now := time.Now().Unix()

		records := []map[string]any{
			{
				"coords_latitudeValue":                   57.70685,
				"coords_longitudeValue":                  11.95525,
				"dataRetrievedTimestamp":                 now,
				"imageUrl":                               "uploads/waterbag/gbg_klippan_01.jpg",
				"airTemp_value":                          7.4,
				"airTemp_dataRetrievedTimestamp":         now,
				"waterTemp_value":                        5.6,
				"waterTemp_dataRetrievedTimestamp":       now,
				"visibility_value":                       2.8,
				"visibility_dataRetrievedTimestamp":      now,
				"algae_value":                            0.4,
				"algae_dataRetrievedTimestamp":           now,
				"waterPh_value":                          7.2,
				"waterPh_dataRetrievedTimestamp":         now,
				"waterPh_result":                         1,
				"turbidity_value":                        3.1,
				"turbidity_dataRetrievedTimestamp":       now,
				"turbidity_result":                       1,
				"nitrate_value":                          1.4,
				"nitrate_dataRetrievedTimestamp":         now,
				"nitrate_result":                         1,
				"phosphate_value":                        0.18,
				"phosphate_dataRetrievedTimestamp":       now,
				"phosphate_result":                       1,
				"dissolvedOxygen_value":                  8.7,
				"dissolvedOxygen_dataRetrievedTimestamp": now,
				"dissolvedOxygen_result":                 1,
				"dissolvedOxygen_calculatedValue":        8.5,
			},
			{
				"coords_latitudeValue":                   57.70195,
				"coords_longitudeValue":                  11.94090,
				"dataRetrievedTimestamp":                 now - 120,
				"imageUrl":                               "uploads/waterbag/gbg_stigbergstorget_01.jpg",
				"airTemp_value":                          7.1,
				"airTemp_dataRetrievedTimestamp":         now - 120,
				"waterTemp_value":                        5.4,
				"waterTemp_dataRetrievedTimestamp":       now - 120,
				"visibility_value":                       3.0,
				"visibility_dataRetrievedTimestamp":      now - 120,
				"algae_value":                            0.5,
				"algae_dataRetrievedTimestamp":           now - 120,
				"waterPh_value":                          7.1,
				"waterPh_dataRetrievedTimestamp":         now - 120,
				"waterPh_result":                         1,
				"turbidity_value":                        3.4,
				"turbidity_dataRetrievedTimestamp":       now - 120,
				"turbidity_result":                       1,
				"nitrate_value":                          1.7,
				"nitrate_dataRetrievedTimestamp":         now - 120,
				"nitrate_result":                         1,
				"phosphate_value":                        0.21,
				"phosphate_dataRetrievedTimestamp":       now - 120,
				"phosphate_result":                       1,
				"dissolvedOxygen_value":                  8.4,
				"dissolvedOxygen_dataRetrievedTimestamp": now - 120,
				"dissolvedOxygen_result":                 1,
				"dissolvedOxygen_calculatedValue":        8.2,
			},
			{
				"coords_latitudeValue":                   57.70630,
				"coords_longitudeValue":                  11.96690,
				"dataRetrievedTimestamp":                 now - 240,
				"imageUrl":                               "uploads/waterbag/gbg_operan_01.jpg",
				"airTemp_value":                          7.6,
				"airTemp_dataRetrievedTimestamp":         now - 240,
				"waterTemp_value":                        5.7,
				"waterTemp_dataRetrievedTimestamp":       now - 240,
				"visibility_value":                       2.6,
				"visibility_dataRetrievedTimestamp":      now - 240,
				"algae_value":                            0.6,
				"algae_dataRetrievedTimestamp":           now - 240,
				"waterPh_value":                          7.3,
				"waterPh_dataRetrievedTimestamp":         now - 240,
				"waterPh_result":                         1,
				"turbidity_value":                        3.6,
				"turbidity_dataRetrievedTimestamp":       now - 240,
				"turbidity_result":                       1,
				"nitrate_value":                          1.5,
				"nitrate_dataRetrievedTimestamp":         now - 240,
				"nitrate_result":                         1,
				"phosphate_value":                        0.19,
				"phosphate_dataRetrievedTimestamp":       now - 240,
				"phosphate_result":                       1,
				"dissolvedOxygen_value":                  8.9,
				"dissolvedOxygen_dataRetrievedTimestamp": now - 240,
				"dissolvedOxygen_result":                 1,
				"dissolvedOxygen_calculatedValue":        8.7,
			},
			{
				"coords_latitudeValue":                   57.70690,
				"coords_longitudeValue":                  11.97980,
				"dataRetrievedTimestamp":                 now - 360,
				"imageUrl":                               "uploads/waterbag/gbg_lilla_bommen_01.jpg",
				"airTemp_value":                          7.3,
				"airTemp_dataRetrievedTimestamp":         now - 360,
				"waterTemp_value":                        5.5,
				"waterTemp_dataRetrievedTimestamp":       now - 360,
				"visibility_value":                       2.4,
				"visibility_dataRetrievedTimestamp":      now - 360,
				"algae_value":                            0.7,
				"algae_dataRetrievedTimestamp":           now - 360,
				"waterPh_value":                          7.2,
				"waterPh_dataRetrievedTimestamp":         now - 360,
				"waterPh_result":                         1,
				"turbidity_value":                        3.9,
				"turbidity_dataRetrievedTimestamp":       now - 360,
				"turbidity_result":                       1,
				"nitrate_value":                          1.6,
				"nitrate_dataRetrievedTimestamp":         now - 360,
				"nitrate_result":                         1,
				"phosphate_value":                        0.22,
				"phosphate_dataRetrievedTimestamp":       now - 360,
				"phosphate_result":                       1,
				"dissolvedOxygen_value":                  8.3,
				"dissolvedOxygen_dataRetrievedTimestamp": now - 360,
				"dissolvedOxygen_result":                 1,
				"dissolvedOxygen_calculatedValue":        8.1,
			},
		}

		for _, data := range records {
			record := core.NewRecord(collection)
			record.Load(data)
			if err := app.Save(record); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		records, err := app.FindRecordsByFilter(
			"streetai_waterbag_testkit",
			`imageUrl ~ "uploads/waterbag/gbg_"`,
			"",
			0,
			0,
		)
		if err != nil {
			return err
		}

		for _, record := range records {
			if err := app.Delete(record); err != nil {
				return err
			}
		}

		return nil
	})
}
