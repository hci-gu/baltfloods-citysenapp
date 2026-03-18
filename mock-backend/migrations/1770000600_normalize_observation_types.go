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
			currentType := record.GetString("type")
			data := unifiedValueAsMap(record.GetRaw("data"))
			observationType := strings.TrimSpace(normalizedObservationType(data))
			updated := false

			switch currentType {
			case "water_observation":
				if observationType == "water_overflow" {
					record.Set("type", "water_overflow")
				} else {
					record.Set("type", "waterbag_testkit")
				}
				updated = true
			case "waterbag_testkit":
				if observationType == "water_overflow" {
					record.Set("type", "water_overflow")
					updated = true
				}
			case "water_overflow":
				if data == nil {
					data = map[string]any{}
				}
				if data["observationType"] == nil {
					data["observationType"] = "water_overflow"
					record.Set("data", data)
					updated = true
				}
			case "storm_water":
				if record.GetString("imageUrl") != "" {
					record.Set("imageUrl", "")
					updated = true
				}
				if photoName := unifiedFirstFileName(record.Get("photo")); photoName != "" {
					record.Set("photo", []string{})
					updated = true
				}
			}

			if strings.TrimSpace(record.GetString("name")) == "" {
				shortID := record.Id
				if len(shortID) > 6 {
					shortID = shortID[:6]
				}
				record.Set("name", fmt.Sprintf("%s %s", humanizeObservationType(record.GetString("type")), strings.ToUpper(shortID)))
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

		records, err := app.FindRecordsByFilter(
			"observations",
			`type = "water_overflow"`,
			"",
			0,
			0,
		)
		if err != nil {
			return err
		}

		for _, record := range records {
			record.Set("type", "water_observation")
			if err := app.Save(record); err != nil {
				return err
			}
		}

		return nil
	})
}

func normalizedObservationType(data map[string]any) string {
	if len(data) == 0 {
		return ""
	}
	value, ok := data["observationType"]
	if !ok || value == nil {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return text
}

func humanizeObservationType(observationType string) string {
	switch observationType {
	case "storm_water":
		return "Storm water"
	case "waterbag_testkit":
		return "Waterbag testkit"
	case "water_overflow":
		return "Water overflow"
	default:
		return "Observation"
	}
}
