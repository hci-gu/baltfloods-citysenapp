package migrations

import (
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
		if err != nil || collection == nil {
			return err
		}

		records, err := app.FindRecordsByFilter("streetai_waterbag_testkit", "", "", 0, 0)
		if err != nil {
			return err
		}

		for _, record := range records {
			needsMigration := false
			for _, fieldName := range []string{
				"latitude",
				"longitude",
				"airTemp",
				"waterTemp",
				"depthOfView",
				"algaeLevel",
				"waterPh",
				"turbidity",
				"dissolvedOxygen",
				"nitrate",
				"phosphate",
			} {
				if record.GetRaw(fieldName) != nil {
					needsMigration = true
					break
				}
			}
			if !needsMigration {
				continue
			}

			timestamp := resolveTimestampSeconds(record)
			if record.GetRaw("dataRetrievedTimestamp") == nil {
				record.Set("dataRetrievedTimestamp", float64(timestamp))
			}
			dataTimestamp := record.GetRaw("dataRetrievedTimestamp")
			metricTimestamp := toFloatOr(dataTimestamp, float64(timestamp))

			if record.GetRaw("coords_latitudeValue") == nil {
				if value, ok := toFloat(record.GetRaw("latitude")); ok {
					record.Set("coords_latitudeValue", value)
				}
			}
			if record.GetRaw("coords_longitudeValue") == nil {
				if value, ok := toFloat(record.GetRaw("longitude")); ok {
					record.Set("coords_longitudeValue", value)
				}
			}

			migrateMetric(record, "airTemp", "airTemp_value", "airTemp_dataRetrievedTimestamp", metricTimestamp)
			migrateMetric(record, "waterTemp", "waterTemp_value", "waterTemp_dataRetrievedTimestamp", metricTimestamp)
			migrateMetric(record, "depthOfView", "visibility_value", "visibility_dataRetrievedTimestamp", metricTimestamp)
			migrateMetric(record, "waterPh", "waterPh_value", "waterPh_dataRetrievedTimestamp", metricTimestamp)
			migrateMetric(record, "turbidity", "turbidity_value", "turbidity_dataRetrievedTimestamp", metricTimestamp)
			migrateMetric(record, "dissolvedOxygen", "dissolvedOxygen_value", "dissolvedOxygen_dataRetrievedTimestamp", metricTimestamp)
			migrateMetric(record, "nitrate", "nitrate_value", "nitrate_dataRetrievedTimestamp", metricTimestamp)
			migrateMetric(record, "phosphate", "phosphate_value", "phosphate_dataRetrievedTimestamp", metricTimestamp)
			migrateAlgae(record, "algaeLevel", "algae_value", "algae_dataRetrievedTimestamp", metricTimestamp)

			if err := app.Save(record); err != nil {
				return err
			}
		}

		for _, fieldName := range []string{
			"latitude",
			"longitude",
			"airTemp",
			"waterTemp",
			"depthOfView",
			"algaeLevel",
			"waterPh",
			"turbidity",
			"dissolvedOxygen",
			"nitrate",
			"phosphate",
		} {
			collection.Fields.RemoveByName(fieldName)
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
		if err != nil || collection == nil {
			return err
		}

		collection.Fields.Add(
			&core.NumberField{Name: "latitude"},
			&core.NumberField{Name: "longitude"},
			&core.NumberField{Name: "airTemp"},
			&core.NumberField{Name: "waterTemp"},
			&core.NumberField{Name: "depthOfView"},
			&core.TextField{Name: "algaeLevel"},
			&core.NumberField{Name: "waterPh"},
			&core.NumberField{Name: "turbidity"},
			&core.NumberField{Name: "dissolvedOxygen"},
			&core.NumberField{Name: "nitrate"},
			&core.NumberField{Name: "phosphate"},
		)

		return app.Save(collection)
	})
}

func resolveTimestampSeconds(record *core.Record) int64 {
	value := record.GetRaw("created")
	switch typed := value.(type) {
	case time.Time:
		return typed.Unix()
	case *time.Time:
		return typed.Unix()
	case string:
		if parsed, err := time.Parse(time.RFC3339Nano, typed); err == nil {
			return parsed.Unix()
		}
		if parsed, err := time.Parse(time.RFC3339, typed); err == nil {
			return parsed.Unix()
		}
	}
	return time.Now().Unix()
}

func migrateMetric(
	record *core.Record,
	legacyField string,
	valueField string,
	timestampField string,
	timestamp float64,
) {
	if record.GetRaw(valueField) != nil {
		return
	}
	if value, ok := toFloat(record.GetRaw(legacyField)); ok {
		record.Set(valueField, value)
		record.Set(timestampField, timestamp)
	}
}

func migrateAlgae(
	record *core.Record,
	legacyField string,
	valueField string,
	timestampField string,
	timestamp float64,
) {
	if record.GetRaw(valueField) != nil {
		return
	}
	value, ok := record.GetRaw(legacyField).(string)
	if !ok || value == "" {
		return
	}
	if mapped, ok := algaeLevelToValue(value); ok {
		record.Set(valueField, mapped)
		record.Set(timestampField, timestamp)
	}
}

func algaeLevelToValue(value string) (float64, bool) {
	switch value {
	case "none":
		return 1, true
	case "little":
		return 2, true
	case "rich":
		return 3, true
	case "very_rich":
		return 4, true
	default:
		return 0, false
	}
}

func toFloat(raw any) (float64, bool) {
	switch typed := raw.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	case uint32:
		return float64(typed), true
	default:
		return 0, false
	}
}

func toFloatOr(raw any, fallback float64) float64 {
	if value, ok := toFloat(raw); ok {
		return value
	}
	return fallback
}
