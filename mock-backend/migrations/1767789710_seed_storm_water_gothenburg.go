package migrations

import (
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("streetai_storm_water")
		if err != nil {
			return err
		}

		now := time.Now().Unix()

		records := []map[string]any{
			{
				"name":                   "Gothenburg Central",
				"latitude":               57.70887,
				"longitude":              11.97365,
				"dataRetrievedTimestamp": now,
				"waterLevel":             1.12,
				"waterTemperature":       6.8,
				"electricalConductivity": 520,
				"turbidity":              3.2,
				"flowRate":               0.42,
				"fillLevel_value":        0.34,
				"fillLevel_result":       1,
				"waterQuality":           2,
			},
			{
				"name":                   "Järntorget",
				"latitude":               57.69964,
				"longitude":              11.95275,
				"dataRetrievedTimestamp": now - 120,
				"waterLevel":             0.78,
				"waterTemperature":       6.2,
				"electricalConductivity": 480,
				"turbidity":              2.6,
				"flowRate":               0.31,
				"fillLevel_value":        0.28,
				"fillLevel_result":       1,
				"waterQuality":           3,
			},
			{
				"name":                   "Linnéplatsen",
				"latitude":               57.69357,
				"longitude":              11.95398,
				"dataRetrievedTimestamp": now - 240,
				"waterLevel":             1.35,
				"waterTemperature":       6.0,
				"electricalConductivity": 610,
				"turbidity":              4.1,
				"flowRate":               0.55,
				"fillLevel_value":        0.52,
				"fillLevel_result":       2,
				"waterQuality":           4,
			},
			{
				"name":                   "Korsvägen",
				"latitude":               57.69680,
				"longitude":              11.98720,
				"dataRetrievedTimestamp": now - 360,
				"waterLevel":             0.95,
				"waterTemperature":       6.5,
				"electricalConductivity": 540,
				"turbidity":              3.7,
				"flowRate":               0.38,
				"fillLevel_value":        0.31,
				"fillLevel_result":       1,
				"waterQuality":           5,
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
			"streetai_storm_water",
			`name ~ "Gothenburg" || name ~ "Järntorget" || name ~ "Linnéplatsen" || name ~ "Korsvägen"`,
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
