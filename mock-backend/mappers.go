package main

import (
	"math"
	"strconv"

	"github.com/pocketbase/pocketbase/core"
)

func mapWeatherConditions(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"name":                   record.GetRaw("name"),
			"latitude":               record.GetRaw("latitude"),
			"longitude":              record.GetRaw("longitude"),
			"dataRetrievedTimestamp": record.GetRaw("dataRetrievedTimestamp"),
			"temperature":            record.GetRaw("temperature"),
			"humidity":               record.GetRaw("humidity"),
			"visibility":             record.GetRaw("visibility"),
			"pressure":               record.GetRaw("pressure"),
			"dewPoint":               record.GetRaw("dewPoint"),
			"windDirection":          record.GetRaw("windDirection"),
			"windSpeed":              record.GetRaw("windSpeed"),
			"windGust":               record.GetRaw("windGust"),
			"cloudCover":             record.GetRaw("cloudCover"),
			"snowDepth":              record.GetRaw("snowDepth"),
			"friction":               record.GetRaw("friction"),
			"ice":                    record.GetRaw("ice"),
			"streetState":            record.GetRaw("streetState"),
		})
	}
	return items
}

func mapAirQuality(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"name":                   record.GetRaw("name"),
			"latitude":               record.GetRaw("latitude"),
			"longitude":              record.GetRaw("longitude"),
			"dataRetrievedTimestamp": record.GetRaw("dataRetrievedTimestamp"),
			"measurementIndex":       record.GetRaw("measurementIndex"),
		})
	}
	return items
}

func mapStormWater(records []*core.Record, includeHidden bool) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		if record.GetString("type") != observationTypeStormWater {
			continue
		}
		if !isObservationVisible(record, includeHidden) {
			continue
		}

		data := observationData(record)
		fillLevel := valueAsMap(data["fillLevel"])
		if fillLevel == nil {
			fillLevel = map[string]any{
				"value":  data["fillLevel_value"],
				"result": data["fillLevel_result"],
			}
		}

		items = append(items, map[string]any{
			"name":      record.GetRaw("name"),
			"latitude":  record.GetRaw("latitude"),
			"longitude": record.GetRaw("longitude"),
			"dataRetrievedTimestamp": firstNonNil(
				record.GetRaw("dataRetrievedTimestamp"),
				int64(resolveObservationTimestamp(record)),
			),
			"waterLevel":             data["waterLevel"],
			"waterTemperature":       data["waterTemperature"],
			"electricalConductivity": data["electricalConductivity"],
			"turbidity":              data["turbidity"],
			"flowRate":               data["flowRate"],
			"fillLevel":              fillLevel,
			"waterQuality":           normalizeStormWaterQuality(data["waterQuality"]),
		})
	}
	return items
}

func normalizeStormWaterQuality(value any) int {
	const minQuality = 0
	const maxQuality = 6

	coerced := 0
	switch v := value.(type) {
	case int:
		coerced = v
	case int64:
		coerced = int(v)
	case float64:
		coerced = int(math.Round(v))
	case float32:
		coerced = int(math.Round(float64(v)))
	case string:
		if parsed, err := strconv.ParseFloat(v, 64); err == nil {
			coerced = int(math.Round(parsed))
		}
	}

	if coerced < minQuality {
		return minQuality
	}
	if coerced > maxQuality {
		return maxQuality
	}
	return coerced
}

func mapParking(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"name":                   record.GetRaw("name"),
			"latitude":               record.GetRaw("latitude"),
			"longitude":              record.GetRaw("longitude"),
			"dataSource":             record.GetRaw("dataSource"),
			"dataRetrievedTimestamp": record.GetRaw("dataRetrievedTimestamp"),
			"availableSpots":         record.GetRaw("availableSpots"),
			"capacity":               record.GetRaw("capacity"),
		})
	}
	return items
}

func mapRoadWorks(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"name":           record.GetRaw("name"),
			"latitude":       record.GetRaw("latitude"),
			"longitude":      record.GetRaw("longitude"),
			"validityPeriod": record.GetRaw("validityPeriod"),
		})
	}
	return items
}

func mapWaterbagTestkit(records []*core.Record, includeHidden bool) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		if record.GetString("type") != observationTypeWaterbagTestkit {
			continue
		}
		if !isObservationVisible(record, includeHidden) {
			continue
		}

		latitude := record.GetRaw("latitude")
		longitude := record.GetRaw("longitude")
		if latitude == nil || longitude == nil {
			continue
		}

		data := observationData(record)
		if _, userSubmitted := data["observationType"]; userSubmitted {
			continue
		}

		items = append(items, map[string]any{
			"id": record.Id,
			"coords": map[string]any{
				"latitudeValue":  latitude,
				"longitudeValue": longitude,
			},
			"dataRetrievedTimestamp": firstNonNil(
				record.GetRaw("dataRetrievedTimestamp"),
				int64(resolveObservationTimestamp(record)),
			),
			"imageUrl":   observationImageURL(record, "observations"),
			"airTemp":    metricWithOptionalFields(data, "airTemp"),
			"waterTemp":  metricWithOptionalFields(data, "waterTemp"),
			"visibility": metricWithOptionalFields(data, "visibility"),
			"algae":      metricWithOptionalFields(data, "algae"),
			"waterPh":    metricWithOptionalFields(data, "waterPh", "result"),
			"turbidity":  metricWithOptionalFields(data, "turbidity", "result"),
			"nitrate":    metricWithOptionalFields(data, "nitrate", "result"),
			"phosphate":  metricWithOptionalFields(data, "phosphate", "result"),
			"dissolvedOxygen": metricWithOptionalFields(
				data,
				"dissolvedOxygen",
				"result",
				"calculatedValue",
			),
		})
	}
	return items
}

func mapServiceDefinitions(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"service_code": record.GetRaw("service_code"),
			"service_name": record.GetRaw("service_name"),
			"description":  record.GetRaw("description"),
			"metadata":     record.GetRaw("metadata"),
			"type":         record.GetRaw("type"),
			"keywords":     record.GetRaw("keywords"),
			"group":        record.GetRaw("group"),
		})
	}
	return items
}

func mapWaterObservations(records []*core.Record, includeHidden bool) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		recordType := record.GetString("type")
		if recordType != observationTypeWaterOverflow &&
			recordType != observationTypeWaterbagTestkit {
			continue
		}
		if !isObservationVisible(record, includeHidden) {
			continue
		}

		data := observationData(record)
		imageUrl := observationImageURL(record, "observations")
		observationType := firstNonNil(data["observationType"], record.GetRaw("observationType"))
		if recordType == observationTypeWaterOverflow {
			if observationType == nil {
				observationType = observationTypeWaterOverflow
			}
		} else {
			// Only include manually submitted water observations.
			if observationType == nil {
				continue
			}
		}

		algaeLevel := data["algaeLevel"]
		if algaeLevel == nil {
			algaeLevel = mapAlgaeValueToLevel(data["algae_value"])
		} else if value, ok := algaeLevel.(string); ok && value == "" {
			algaeLevel = mapAlgaeValueToLevel(data["algae_value"])
		}

		items = append(items, map[string]any{
			"id":                     record.Id,
			"name":                   firstNonNil(record.GetRaw("name"), record.Id),
			"created":                record.GetRaw("created"),
			"latitude":               firstNonNil(record.GetRaw("latitude"), data["latitude"]),
			"longitude":              firstNonNil(record.GetRaw("longitude"), data["longitude"]),
			"dataRetrievedTimestamp": resolveObservationTimestamp(record),
			"photo":                  record.GetRaw("photo"),
			"imageUrl":               imageUrl,
			"observationType":        observationType,
			"airTemp":                data["airTemp"],
			"waterTemp":              data["waterTemp"],
			"depthOfView":            data["depthOfView"],
			"algaeLevel":             algaeLevel,
			"waterPh":                data["waterPh"],
			"turbidity":              data["turbidity"],
			"dissolvedOxygen":        data["dissolvedOxygen"],
			"nitrate":                data["nitrate"],
			"phosphate":              data["phosphate"],
		})
	}
	return items
}
