package migrations

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		observations, err := app.FindCollectionByNameOrId("observations")
		if err != nil || observations == nil {
			return nil
		}

		if typeField, ok := observations.Fields.GetByName("type").(*core.SelectField); ok {
			typeField.Values = []string{
				"storm_water",
				"waterbag_testkit",
				"water_overflow",
			}
			typeField.MaxSelect = 1
			if err := app.Save(observations); err != nil {
				return err
			}
		}

		records, err := app.FindRecordsByFilter("observations", "", "", 0, 0)
		if err != nil {
			return err
		}

		for _, record := range records {
			currentType := strings.TrimSpace(record.GetString("type"))
			data := unifiedValueAsMap(record.GetRaw("data"))
			observationType := strings.TrimSpace(normalizedObservationType(data))
			nextType := currentType
			updated := false

			switch {
			case currentType == "storm_water":
				nextType = "storm_water"
				if record.GetString("imageUrl") != "" {
					record.Set("imageUrl", "")
					updated = true
				}
				if photoName := unifiedFirstFileName(record.Get("photo")); photoName != "" {
					record.Set("photo", []string{})
					updated = true
				}
			case observationType == "water_overflow":
				nextType = "water_overflow"
			case currentType == "waterbag_testkit":
				nextType = "waterbag_testkit"
			case currentType == "water_observation":
				nextType = "waterbag_testkit"
			default:
				nextType = "waterbag_testkit"
			}

			if nextType != currentType {
				record.Set("type", nextType)
				updated = true
			}

			if strings.TrimSpace(record.GetString("name")) == "" {
				shortID := record.Id
				if len(shortID) > 6 {
					shortID = shortID[:6]
				}
				record.Set("name", fmt.Sprintf("%s %s", humanizeObservationType(nextType), strings.ToUpper(shortID)))
				updated = true
			}

			if updated {
				if err := app.Save(record); err != nil {
					return err
				}
			}
		}

		return nil
	}, func(app core.App) error {
		observations, err := app.FindCollectionByNameOrId("observations")
		if err != nil || observations == nil {
			return nil
		}

		if typeField, ok := observations.Fields.GetByName("type").(*core.SelectField); ok {
			typeField.Values = []string{
				"storm_water",
				"waterbag_testkit",
				"water_observation",
			}
			typeField.MaxSelect = 1
			if err := app.Save(observations); err != nil {
				return err
			}
		}

		return nil
	})
}
