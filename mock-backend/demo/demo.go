// Package demo generates the synthetic observation layers around a configured origin.
// Historical migrations stay unchanged; runtime generation uses the current schema.
package demo

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const SettingsID = "appsettings0001"

const resetMarker = "@citysenDemoReset"

// IsResetRecord distinguishes bulk replacement from ordinary moderation of
// generated records. This transient flag is never persisted in the database.
func IsResetRecord(record *core.Record) bool { return record.GetBool(resetMarker) }

type Origin struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// ParseOrigin rejects incomplete objects, including missing coordinates that
// would otherwise silently become zero. Zero itself is a valid coordinate.
func ParseOrigin(record *core.Record) (Origin, error) {
	var value struct {
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
	}
	if err := record.UnmarshalJSONField("origin", &value); err != nil || value.Latitude == nil || value.Longitude == nil {
		return Origin{}, fmt.Errorf("origin must contain numeric latitude and longitude")
	}
	origin := Origin{*value.Latitude, *value.Longitude}
	if math.IsNaN(origin.Latitude) || math.IsInf(origin.Latitude, 0) || math.Abs(origin.Latitude) > 90 ||
		math.IsNaN(origin.Longitude) || math.IsInf(origin.Longitude, 0) || math.Abs(origin.Longitude) > 180 {
		return Origin{}, fmt.Errorf("latitude must be between -90 and 90 and longitude between -180 and 180")
	}
	return origin, nil
}

// Replace must run inside the same transaction as the settings update.
func Replace(app core.App, origin Origin, now time.Time, seed int64) error {
	collection, err := app.FindCollectionByNameOrId("observations")
	if err != nil {
		return err
	}
	old, err := app.FindRecordsByFilter(collection, "demoGenerated = true", "", 0, 0)
	if err != nil {
		return err
	}
	for _, record := range old {
		record.SetRaw(resetMarker, true)
		if err := app.Delete(record); err != nil {
			return err
		}
	}
	city := seedCity{latitude: origin.Latitude, longitude: origin.Longitude}
	rng := rand.New(rand.NewSource(seed))
	if err := generateStorm(app, collection, city, now, rng); err != nil {
		return err
	}
	if err := generateWaterbag(app, collection, city, now, rng); err != nil {
		return err
	}
	return generateOverflow(app, collection, city, now, rng)
}

type seedCity struct{ latitude, longitude float64 }

func seedSpotDisplayName(_ seedCity, label string) string { return label }

// Spherical offsets also work at the poles and across the antimeridian.
func seedOffsetCoordinate(city seedCity, northKm, eastKm float64) (float64, float64) {
	distance := math.Hypot(northKm, eastKm) / 6371
	bearing := math.Atan2(eastKm, northKm)
	lat := city.latitude * math.Pi / 180
	lon := city.longitude * math.Pi / 180
	nextLat := math.Asin(math.Sin(lat)*math.Cos(distance) + math.Cos(lat)*math.Sin(distance)*math.Cos(bearing))
	nextLon := lon + math.Atan2(math.Sin(bearing)*math.Sin(distance)*math.Cos(lat), math.Cos(distance)-math.Sin(lat)*math.Sin(nextLat))
	return nextLat * 180 / math.Pi, math.Mod(nextLon*180/math.Pi+540, 360) - 180
}

func observationFromMetrics(collection *core.Collection, kind string, values map[string]any) *core.Record {
	record := core.NewRecord(collection)
	record.SetRaw(resetMarker, true)
	record.Set("type", kind)
	record.Set("name", values["name"])
	record.Set("visible", true)
	record.Set("demoGenerated", true)
	record.Set("dataRetrievedTimestamp", values["dataRetrievedTimestamp"])
	record.Set("imageUrl", values["imageUrl"])
	data := map[string]any{}
	if kind == "storm_water" {
		record.Set("latitude", values["latitude"])
		record.Set("longitude", values["longitude"])
		for _, key := range []string{"waterLevel", "waterTemperature", "electricalConductivity", "turbidity", "flowRate", "waterQuality"} {
			data[key] = values[key]
		}
		data["fillLevel"] = map[string]any{"value": values["fillLevel_value"], "result": values["fillLevel_result"]}
	} else {
		record.Set("latitude", values["coords_latitudeValue"])
		record.Set("longitude", values["coords_longitudeValue"])
		for _, key := range []string{"airTemp", "waterTemp", "visibility", "algae", "waterPh", "turbidity", "nitrate", "phosphate", "dissolvedOxygen"} {
			metric := map[string]any{}
			for _, suffix := range []string{"value", "dataRetrievedTimestamp", "result", "calculatedValue"} {
				if value, ok := values[key+"_"+suffix]; ok {
					metric[suffix] = value
				}
			}
			data[key] = metric
		}
	}
	record.Set("data", data)
	return record
}

// LegacyGenerated is deliberately conservative: genuine submissions have a
// user, uploaded photo, or submission metadata and must never be replaced.
func LegacyGenerated(record *core.Record) bool {
	if record.GetString("user") != "" || len(record.GetStringSlice("photo")) > 0 {
		return false
	}
	var data map[string]json.RawMessage
	if err := record.UnmarshalJSONField("data", &data); err != nil {
		return false
	}
	for _, key := range []string{"identificationCode", "termsAccepted", "cc0Accepted"} {
		if _, exists := data[key]; exists {
			return false
		}
	}
	name := record.GetString("name")
	switch record.GetString("type") {
	case "storm_water":
		return strings.HasPrefix(name, "Seed Storm ")
	case "waterbag_testkit":
		return strings.HasPrefix(name, "Seed Waterbag ") && record.GetString("imageUrl") == "/assets/images/waterbag_testkit.jpg"
	case "water_overflow":
		return strings.HasPrefix(name, "Seed Overflow ") && record.GetString("imageUrl") == "/assets/images/water_overflow.jpg"
	}
	return false
}
