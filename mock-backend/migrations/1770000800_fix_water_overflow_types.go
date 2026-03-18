package migrations

import (
	"encoding/json"
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

		records, err := app.FindRecordsByFilter("observations", "", "", 10000, 0)
		if err != nil {
			return err
		}

		for _, record := range records {
			currentType := strings.TrimSpace(record.GetString("type"))
			observationType := extractObservationType(record)
			updated := false

			if currentType == "water_observation" {
				currentType = "waterbag_testkit"
				record.Set("type", currentType)
				updated = true
			}

			if observationType == "water_overflow" && currentType != "water_overflow" {
				currentType = "water_overflow"
				record.Set("type", currentType)
				updated = true
			}

			if currentType == "storm_water" {
				if record.GetString("imageUrl") != "" {
					record.Set("imageUrl", "")
					updated = true
				}
				if unifiedFirstFileName(record.Get("photo")) != "" {
					record.Set("photo", []string{})
					updated = true
				}
			}

			if strings.TrimSpace(record.GetString("name")) == "" {
				shortID := record.Id
				if len(shortID) > 6 {
					shortID = shortID[:6]
				}
				record.Set("name", fmt.Sprintf("%s %s", humanizeObservationType(currentType), strings.ToUpper(shortID)))
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

func extractObservationType(record *core.Record) string {
	data := unifiedValueAsMap(record.GetRaw("data"))
	if data == nil {
		raw := strings.TrimSpace(record.GetString("data"))
		if raw != "" {
			var parsed map[string]any
			if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
				data = parsed
			}
		}
	}
	if data == nil {
		return ""
	}

	value, ok := data["observationType"]
	if !ok || value == nil {
		return ""
	}

	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		if len(typed) == 0 {
			return ""
		}
		if first, ok := typed[0].(string); ok {
			return strings.TrimSpace(first)
		}
	case []string:
		if len(typed) > 0 {
			return strings.TrimSpace(typed[0])
		}
	}

	return ""
}
