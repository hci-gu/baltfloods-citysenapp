package migrations

import (
	"encoding/json"
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	unifiedObservationTypeStormWater       = "storm_water"
	unifiedObservationTypeWaterbagTestkit  = "waterbag_testkit"
	unifiedObservationTypeWaterObservation = "water_observation"
)

func init() {
	m.Register(func(app core.App) error {
		observations, err := ensureUnifiedObservationsCollection(app)
		if err != nil {
			return err
		}

		if err := migrateStormWaterIntoObservations(app, observations); err != nil {
			return err
		}
		if err := migrateWaterbagIntoObservations(app, observations); err != nil {
			return err
		}

		if err := unifiedDeleteCollectionIfExists(app, "streetai_storm_water"); err != nil {
			return err
		}
		return unifiedDeleteCollectionIfExists(app, "streetai_waterbag_testkit")
	}, func(app core.App) error {
		stormWaterCollection, err := ensureLegacyStormWaterCollection(app)
		if err != nil {
			return err
		}

		waterbagCollection, err := ensureLegacyWaterbagCollection(app)
		if err != nil {
			return err
		}

		observationsCollection, err := app.FindCollectionByNameOrId("observations")
		if err != nil || observationsCollection == nil {
			return nil
		}

		records, err := app.FindRecordsByFilter("observations", "", "", 0, 0)
		if err != nil {
			return err
		}

		for _, record := range records {
			switch record.GetString("type") {
			case unifiedObservationTypeStormWater:
				if err := migrateObservationToLegacyStormWater(app, stormWaterCollection, record); err != nil {
					return err
				}
			case unifiedObservationTypeWaterbagTestkit:
				if err := migrateObservationToLegacyWaterbag(app, waterbagCollection, record, false); err != nil {
					return err
				}
			case unifiedObservationTypeWaterObservation:
				if err := migrateObservationToLegacyWaterbag(app, waterbagCollection, record, true); err != nil {
					return err
				}
			}
		}

		return app.Delete(observationsCollection)
	})
}

func ensureUnifiedObservationsCollection(app core.App) (*core.Collection, error) {
	existing, err := app.FindCollectionByNameOrId("observations")
	if err == nil && existing != nil {
		return existing, nil
	}

	observations := core.NewCollection(core.CollectionTypeBase, "observations")
	observations.Fields = core.NewFieldsList(
		&core.SelectField{
			Name:      "type",
			Values:    []string{unifiedObservationTypeStormWater, unifiedObservationTypeWaterbagTestkit, unifiedObservationTypeWaterObservation},
			MaxSelect: 1,
		},
		&core.TextField{Name: "name"},
		&core.NumberField{Name: "latitude"},
		&core.NumberField{Name: "longitude"},
		&core.NumberField{Name: "dataRetrievedTimestamp"},
		&core.TextField{Name: "imageUrl"},
		&core.FileField{Name: "photo", MaxSelect: 1},
		&core.JSONField{Name: "data"},
	)
	if err := app.Save(observations); err != nil {
		return nil, err
	}
	return observations, nil
}

func migrateStormWaterIntoObservations(app core.App, observations *core.Collection) error {
	_, err := app.FindCollectionByNameOrId("streetai_storm_water")
	if err != nil {
		return nil
	}

	records, err := app.FindRecordsByFilter("streetai_storm_water", "", "", 0, 0)
	if err != nil {
		return err
	}

	for _, record := range records {
		target := core.NewRecord(observations)
		target.Set("type", unifiedObservationTypeStormWater)
		target.Set("name", record.GetRaw("name"))
		target.Set("latitude", record.GetRaw("latitude"))
		target.Set("longitude", record.GetRaw("longitude"))
		target.Set("dataRetrievedTimestamp", record.GetRaw("dataRetrievedTimestamp"))

		target.Set("data", map[string]any{
			"waterLevel":             record.GetRaw("waterLevel"),
			"waterTemperature":       record.GetRaw("waterTemperature"),
			"electricalConductivity": record.GetRaw("electricalConductivity"),
			"turbidity":              record.GetRaw("turbidity"),
			"flowRate":               record.GetRaw("flowRate"),
			"fillLevel": map[string]any{
				"value":  record.GetRaw("fillLevel_value"),
				"result": record.GetRaw("fillLevel_result"),
			},
			"waterQuality": record.GetRaw("waterQuality"),
		})

		if err := app.Save(target); err != nil {
			return err
		}
	}

	return nil
}

func migrateWaterbagIntoObservations(app core.App, observations *core.Collection) error {
	_, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
	if err != nil {
		return nil
	}

	records, err := app.FindRecordsByFilter("streetai_waterbag_testkit", "", "", 0, 0)
	if err != nil {
		return err
	}

	for _, record := range records {
		target := core.NewRecord(observations)
		target.Set("name", record.Id)

		latitude := unifiedFirstNonNil(record.GetRaw("coords_latitudeValue"), record.GetRaw("latitude"))
		longitude := unifiedFirstNonNil(record.GetRaw("coords_longitudeValue"), record.GetRaw("longitude"))
		target.Set("latitude", latitude)
		target.Set("longitude", longitude)
		target.Set("dataRetrievedTimestamp", unifiedFirstNonNil(record.GetRaw("dataRetrievedTimestamp"), float64(unifiedResolveTimestamp(record))))

		imageURL := record.GetRaw("imageUrl")
		if imageURL == nil {
			if filename := unifiedFirstFileName(record.Get("photo")); filename != "" {
				imageURL = "../api/files/streetai_waterbag_testkit/" + record.Id + "/" + filename
			}
		}
		if imageURL != nil {
			target.Set("imageUrl", imageURL)
		}

		observationType := record.GetString("observationType")
		if observationType == "" {
			target.Set("type", unifiedObservationTypeWaterbagTestkit)
			target.Set("data", map[string]any{
				"airTemp":         unifiedMetricMap(record, "airTemp_value", "airTemp_dataRetrievedTimestamp"),
				"waterTemp":       unifiedMetricMap(record, "waterTemp_value", "waterTemp_dataRetrievedTimestamp"),
				"visibility":      unifiedMetricMap(record, "visibility_value", "visibility_dataRetrievedTimestamp"),
				"algae":           unifiedMetricMap(record, "algae_value", "algae_dataRetrievedTimestamp"),
				"waterPh":         unifiedMetricMap(record, "waterPh_value", "waterPh_dataRetrievedTimestamp", "result", record.GetRaw("waterPh_result")),
				"turbidity":       unifiedMetricMap(record, "turbidity_value", "turbidity_dataRetrievedTimestamp", "result", record.GetRaw("turbidity_result")),
				"nitrate":         unifiedMetricMap(record, "nitrate_value", "nitrate_dataRetrievedTimestamp", "result", record.GetRaw("nitrate_result")),
				"phosphate":       unifiedMetricMap(record, "phosphate_value", "phosphate_dataRetrievedTimestamp", "result", record.GetRaw("phosphate_result")),
				"dissolvedOxygen": unifiedMetricMap(record, "dissolvedOxygen_value", "dissolvedOxygen_dataRetrievedTimestamp", "result", record.GetRaw("dissolvedOxygen_result"), "calculatedValue", record.GetRaw("dissolvedOxygen_calculatedValue")),
			})
		} else {
			target.Set("type", unifiedObservationTypeWaterObservation)

			data := map[string]any{
				"observationType":    observationType,
				"identificationCode": record.GetRaw("identificationCode"),
				"termsAccepted":      record.GetRaw("termsAccepted"),
				"cc0Accepted":        record.GetRaw("cc0Accepted"),
				"airTemp":            unifiedFirstNonNil(record.GetRaw("airTemp_value"), record.GetRaw("airTemp")),
				"waterTemp":          unifiedFirstNonNil(record.GetRaw("waterTemp_value"), record.GetRaw("waterTemp")),
				"depthOfView":        unifiedFirstNonNil(record.GetRaw("visibility_value"), record.GetRaw("depthOfView")),
				"waterPh":            unifiedFirstNonNil(record.GetRaw("waterPh_value"), record.GetRaw("waterPh")),
				"turbidity":          unifiedFirstNonNil(record.GetRaw("turbidity_value"), record.GetRaw("turbidity")),
				"dissolvedOxygen":    unifiedFirstNonNil(record.GetRaw("dissolvedOxygen_value"), record.GetRaw("dissolvedOxygen")),
				"nitrate":            unifiedFirstNonNil(record.GetRaw("nitrate_value"), record.GetRaw("nitrate")),
				"phosphate":          unifiedFirstNonNil(record.GetRaw("phosphate_value"), record.GetRaw("phosphate")),
			}

			algaeLevel := record.GetRaw("algaeLevel")
			if algaeLevel == nil {
				algaeLevel = unifiedMapAlgaeValueToLevel(record.GetRaw("algae_value"))
			}
			if algaeLevel != nil {
				data["algaeLevel"] = algaeLevel
			}
			target.Set("data", data)
		}

		if err := app.Save(target); err != nil {
			return err
		}
	}

	return nil
}

func migrateObservationToLegacyStormWater(app core.App, collection *core.Collection, source *core.Record) error {
	data := unifiedObservationData(source)
	target := core.NewRecord(collection)

	target.Set("name", source.GetRaw("name"))
	target.Set("latitude", source.GetRaw("latitude"))
	target.Set("longitude", source.GetRaw("longitude"))
	target.Set("dataRetrievedTimestamp", source.GetRaw("dataRetrievedTimestamp"))
	target.Set("waterLevel", data["waterLevel"])
	target.Set("waterTemperature", data["waterTemperature"])
	target.Set("electricalConductivity", data["electricalConductivity"])
	target.Set("turbidity", data["turbidity"])
	target.Set("flowRate", data["flowRate"])

	fillLevel := unifiedValueAsMap(data["fillLevel"])
	target.Set("fillLevel_value", unifiedFirstNonNil(fillLevel["value"], data["fillLevel_value"]))
	target.Set("fillLevel_result", unifiedFirstNonNil(fillLevel["result"], data["fillLevel_result"]))
	target.Set("waterQuality", data["waterQuality"])

	return app.Save(target)
}

func migrateObservationToLegacyWaterbag(app core.App, collection *core.Collection, source *core.Record, userObservation bool) error {
	data := unifiedObservationData(source)
	target := core.NewRecord(collection)

	target.Set("coords_latitudeValue", source.GetRaw("latitude"))
	target.Set("coords_longitudeValue", source.GetRaw("longitude"))
	target.Set("dataRetrievedTimestamp", source.GetRaw("dataRetrievedTimestamp"))
	target.Set("imageUrl", source.GetRaw("imageUrl"))

	if !userObservation {
		unifiedSetLegacyMetric(target, data, "airTemp", false, false)
		unifiedSetLegacyMetric(target, data, "waterTemp", false, false)
		unifiedSetLegacyMetric(target, data, "visibility", false, false)
		unifiedSetLegacyMetric(target, data, "algae", false, false)
		unifiedSetLegacyMetric(target, data, "waterPh", true, false)
		unifiedSetLegacyMetric(target, data, "turbidity", true, false)
		unifiedSetLegacyMetric(target, data, "nitrate", true, false)
		unifiedSetLegacyMetric(target, data, "phosphate", true, false)
		unifiedSetLegacyMetric(target, data, "dissolvedOxygen", true, true)
		return app.Save(target)
	}

	target.Set("observationType", data["observationType"])
	target.Set("identificationCode", data["identificationCode"])
	target.Set("termsAccepted", data["termsAccepted"])
	target.Set("cc0Accepted", data["cc0Accepted"])

	timestamp := unifiedToFloatOr(source.GetRaw("dataRetrievedTimestamp"), float64(unifiedResolveTimestamp(source)))
	unifiedSetLegacySimpleMetric(target, data["airTemp"], "airTemp_value", "airTemp_dataRetrievedTimestamp", timestamp)
	unifiedSetLegacySimpleMetric(target, data["waterTemp"], "waterTemp_value", "waterTemp_dataRetrievedTimestamp", timestamp)
	unifiedSetLegacySimpleMetric(target, data["depthOfView"], "visibility_value", "visibility_dataRetrievedTimestamp", timestamp)
	unifiedSetLegacySimpleMetric(target, data["waterPh"], "waterPh_value", "waterPh_dataRetrievedTimestamp", timestamp)
	unifiedSetLegacySimpleMetric(target, data["turbidity"], "turbidity_value", "turbidity_dataRetrievedTimestamp", timestamp)
	unifiedSetLegacySimpleMetric(target, data["dissolvedOxygen"], "dissolvedOxygen_value", "dissolvedOxygen_dataRetrievedTimestamp", timestamp)
	unifiedSetLegacySimpleMetric(target, data["nitrate"], "nitrate_value", "nitrate_dataRetrievedTimestamp", timestamp)
	unifiedSetLegacySimpleMetric(target, data["phosphate"], "phosphate_value", "phosphate_dataRetrievedTimestamp", timestamp)

	if mapped, ok := unifiedAlgaeLevelToValue(data["algaeLevel"]); ok {
		target.Set("algae_value", mapped)
		target.Set("algae_dataRetrievedTimestamp", timestamp)
	}

	return app.Save(target)
}

func ensureLegacyStormWaterCollection(app core.App) (*core.Collection, error) {
	existing, err := app.FindCollectionByNameOrId("streetai_storm_water")
	if err == nil && existing != nil {
		return existing, nil
	}

	collection := core.NewCollection(core.CollectionTypeBase, "streetai_storm_water")
	collection.Fields = core.NewFieldsList(
		&core.TextField{Name: "name"},
		&core.NumberField{Name: "latitude"},
		&core.NumberField{Name: "longitude"},
		&core.NumberField{Name: "dataRetrievedTimestamp"},
		&core.NumberField{Name: "waterLevel"},
		&core.NumberField{Name: "waterTemperature"},
		&core.NumberField{Name: "electricalConductivity"},
		&core.NumberField{Name: "turbidity"},
		&core.NumberField{Name: "flowRate"},
		&core.NumberField{Name: "fillLevel_value"},
		&core.NumberField{Name: "fillLevel_result"},
		&core.NumberField{Name: "waterQuality"},
	)
	if err := app.Save(collection); err != nil {
		return nil, err
	}
	return collection, nil
}

func ensureLegacyWaterbagCollection(app core.App) (*core.Collection, error) {
	existing, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
	if err == nil && existing != nil {
		return existing, nil
	}

	collection := core.NewCollection(core.CollectionTypeBase, "streetai_waterbag_testkit")
	collection.Fields = core.NewFieldsList(
		&core.NumberField{Name: "coords_latitudeValue"},
		&core.NumberField{Name: "coords_longitudeValue"},
		&core.NumberField{Name: "dataRetrievedTimestamp"},
		&core.TextField{Name: "imageUrl"},
		&core.NumberField{Name: "airTemp_value"},
		&core.NumberField{Name: "airTemp_dataRetrievedTimestamp"},
		&core.NumberField{Name: "waterTemp_value"},
		&core.NumberField{Name: "waterTemp_dataRetrievedTimestamp"},
		&core.NumberField{Name: "visibility_value"},
		&core.NumberField{Name: "visibility_dataRetrievedTimestamp"},
		&core.NumberField{Name: "algae_value"},
		&core.NumberField{Name: "algae_dataRetrievedTimestamp"},
		&core.NumberField{Name: "waterPh_value"},
		&core.NumberField{Name: "waterPh_dataRetrievedTimestamp"},
		&core.NumberField{Name: "waterPh_result"},
		&core.NumberField{Name: "turbidity_value"},
		&core.NumberField{Name: "turbidity_dataRetrievedTimestamp"},
		&core.NumberField{Name: "turbidity_result"},
		&core.NumberField{Name: "nitrate_value"},
		&core.NumberField{Name: "nitrate_dataRetrievedTimestamp"},
		&core.NumberField{Name: "nitrate_result"},
		&core.NumberField{Name: "phosphate_value"},
		&core.NumberField{Name: "phosphate_dataRetrievedTimestamp"},
		&core.NumberField{Name: "phosphate_result"},
		&core.NumberField{Name: "dissolvedOxygen_value"},
		&core.NumberField{Name: "dissolvedOxygen_dataRetrievedTimestamp"},
		&core.NumberField{Name: "dissolvedOxygen_result"},
		&core.NumberField{Name: "dissolvedOxygen_calculatedValue"},
		&core.TextField{Name: "observationType"},
		&core.FileField{Name: "photo", MaxSelect: 1},
		&core.TextField{Name: "identificationCode"},
		&core.BoolField{Name: "termsAccepted"},
		&core.BoolField{Name: "cc0Accepted"},
	)
	if err := app.Save(collection); err != nil {
		return nil, err
	}
	return collection, nil
}

func unifiedDeleteCollectionIfExists(app core.App, name string) error {
	collection, err := app.FindCollectionByNameOrId(name)
	if err != nil || collection == nil {
		return nil
	}
	return app.Delete(collection)
}

func unifiedMetricMap(record *core.Record, valueField string, timestampField string, extra ...any) map[string]any {
	metric := map[string]any{
		"value":                  record.GetRaw(valueField),
		"dataRetrievedTimestamp": record.GetRaw(timestampField),
	}
	for i := 0; i+1 < len(extra); i += 2 {
		key, ok := extra[i].(string)
		if !ok {
			continue
		}
		metric[key] = extra[i+1]
	}
	return metric
}

func unifiedSetLegacyMetric(record *core.Record, data map[string]any, key string, withResult bool, withCalculated bool) {
	metric := unifiedValueAsMap(data[key])
	if metric == nil {
		return
	}

	if value, ok := unifiedToFloat(metric["value"]); ok {
		record.Set(key+"_value", value)
	}
	if timestamp, ok := unifiedToFloat(metric["dataRetrievedTimestamp"]); ok {
		record.Set(key+"_dataRetrievedTimestamp", timestamp)
	}
	if withResult {
		if result, ok := unifiedToFloat(metric["result"]); ok {
			record.Set(key+"_result", result)
		}
	}
	if withCalculated {
		if calculated, ok := unifiedToFloat(metric["calculatedValue"]); ok {
			record.Set(key+"_calculatedValue", calculated)
		}
	}
}

func unifiedSetLegacySimpleMetric(record *core.Record, raw any, valueField string, timestampField string, timestamp float64) {
	if value, ok := unifiedToFloat(raw); ok {
		record.Set(valueField, value)
		record.Set(timestampField, timestamp)
	}
}

func unifiedObservationData(record *core.Record) map[string]any {
	if data := unifiedValueAsMap(record.GetRaw("data")); data != nil {
		return data
	}
	return map[string]any{}
}

func unifiedValueAsMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	case string:
		if typed == "" {
			return nil
		}
		var parsed map[string]any
		if err := json.Unmarshal([]byte(typed), &parsed); err == nil {
			return parsed
		}
	case []byte:
		var parsed map[string]any
		if err := json.Unmarshal(typed, &parsed); err == nil {
			return parsed
		}
	}
	return nil
}

func unifiedFirstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func unifiedFirstFileName(value any) string {
	switch typed := value.(type) {
	case []string:
		if len(typed) > 0 {
			return typed[0]
		}
	case string:
		return typed
	}
	return ""
}

func unifiedResolveTimestamp(record *core.Record) int64 {
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

func unifiedToFloat(value any) (float64, bool) {
	switch typed := value.(type) {
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

func unifiedToFloatOr(value any, fallback float64) float64 {
	if numeric, ok := unifiedToFloat(value); ok {
		return numeric
	}
	return fallback
}

func unifiedMapAlgaeValueToLevel(value any) any {
	numeric, ok := unifiedToFloat(value)
	if !ok {
		return nil
	}
	switch numeric {
	case 1:
		return "none"
	case 2:
		return "little"
	case 3:
		return "rich"
	case 4:
		return "very_rich"
	default:
		return nil
	}
}

func unifiedAlgaeLevelToValue(value any) (float64, bool) {
	text, ok := value.(string)
	if !ok {
		return 0, false
	}
	switch text {
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
