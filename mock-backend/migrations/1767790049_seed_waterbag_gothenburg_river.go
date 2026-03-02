package migrations

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

type waterbagSeedSpot struct {
	name       string
	latitude   float64
	longitude  float64
	visibility float64
	turbidity  float64
	nitrate    float64
	phosphate  float64
	weight     int
}

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
		if err != nil {
			return err
		}

		const waterbagSeedCount = 280
		now := time.Now()
		rng := rand.New(rand.NewSource(1767790049))

		spots := []waterbagSeedSpot{
			{name: "Klippan", latitude: 57.70685, longitude: 11.95525, visibility: 2.8, turbidity: 3.0, nitrate: 1.4, phosphate: 0.18, weight: 4},
			{name: "Stigbergskajen", latitude: 57.70195, longitude: 11.94090, visibility: 3.2, turbidity: 2.9, nitrate: 1.3, phosphate: 0.16, weight: 3},
			{name: "Opera", latitude: 57.70630, longitude: 11.96690, visibility: 2.6, turbidity: 3.5, nitrate: 1.6, phosphate: 0.21, weight: 5},
			{name: "Lilla Bommen", latitude: 57.70690, longitude: 11.97980, visibility: 2.4, turbidity: 3.8, nitrate: 1.8, phosphate: 0.23, weight: 5},
			{name: "Rosenlund", latitude: 57.70270, longitude: 11.95840, visibility: 2.9, turbidity: 2.8, nitrate: 1.2, phosphate: 0.15, weight: 3},
			{name: "Eriksberg", latitude: 57.70855, longitude: 11.91580, visibility: 2.2, turbidity: 4.1, nitrate: 1.9, phosphate: 0.27, weight: 2},
			{name: "Lindholmen", latitude: 57.70710, longitude: 11.93810, visibility: 2.5, turbidity: 3.6, nitrate: 1.7, phosphate: 0.22, weight: 4},
		}

		for i := 0; i < waterbagSeedCount; i++ {
			spot := pickWaterbagSpot(rng, spots)
			timestamp := randomSeedTimestamp(rng, now, 3)
			season := seasonalFactor(timestamp)
			metricTimestamp := float64(timestamp.Unix())

			airTemp := clampFloat(8.0+season*12.5+rng.NormFloat64()*4.0, -14.0, 31.0)
			waterTemp := clampFloat(8.5+season*8.8+rng.NormFloat64()*1.5, 0.2, 24.0)
			visibility := clampFloat(spot.visibility+rng.NormFloat64()*0.5+season*0.2, 0.3, 6.0)
			algaeValue := clampFloat(0.85+season*0.7+rng.NormFloat64()*0.25, 0.05, 3.95)
			waterPH := clampFloat(7.25+rng.NormFloat64()*0.22, 6.2, 8.7)
			turbidity := clampFloat(spot.turbidity+rng.NormFloat64()*0.8+(1.0-season)*0.25, 0.4, 9.5)
			nitrate := clampFloat(spot.nitrate+rng.NormFloat64()*0.33+(1.0-season)*0.18, 0.08, 5.0)
			phosphate := clampFloat(spot.phosphate+rng.NormFloat64()*0.06+(1.0-season)*0.03, 0.01, 0.8)
			dissolvedOxygen := clampFloat(8.8-season*2.0+rng.NormFloat64()*0.65, 4.0, 13.5)

			data := map[string]any{
				"coords_latitudeValue":                   spot.latitude + rng.NormFloat64()*0.0022,
				"coords_longitudeValue":                  spot.longitude + rng.NormFloat64()*0.0028,
				"dataRetrievedTimestamp":                 metricTimestamp,
				"imageUrl":                               fmt.Sprintf("uploads/waterbag/gbg_seed_%s_%03d.jpg", sanitizeSlug(spot.name), i+1),
				"airTemp_value":                          airTemp,
				"airTemp_dataRetrievedTimestamp":         metricTimestamp,
				"waterTemp_value":                        waterTemp,
				"waterTemp_dataRetrievedTimestamp":       metricTimestamp,
				"visibility_value":                       visibility,
				"visibility_dataRetrievedTimestamp":      metricTimestamp,
				"algae_value":                            algaeValue,
				"algae_dataRetrievedTimestamp":           metricTimestamp,
				"waterPh_value":                          waterPH,
				"waterPh_dataRetrievedTimestamp":         metricTimestamp,
				"waterPh_result":                         qualityBand(waterPH, 6.8, 7.8, 6.4, 8.2),
				"turbidity_value":                        turbidity,
				"turbidity_dataRetrievedTimestamp":       metricTimestamp,
				"turbidity_result":                       qualityBandInverse(turbidity, 2.6, 4.0, 1.5, 5.8),
				"nitrate_value":                          nitrate,
				"nitrate_dataRetrievedTimestamp":         metricTimestamp,
				"nitrate_result":                         qualityBandInverse(nitrate, 1.2, 1.9, 0.6, 2.6),
				"phosphate_value":                        phosphate,
				"phosphate_dataRetrievedTimestamp":       metricTimestamp,
				"phosphate_result":                       qualityBandInverse(phosphate, 0.17, 0.27, 0.08, 0.42),
				"dissolvedOxygen_value":                  dissolvedOxygen,
				"dissolvedOxygen_dataRetrievedTimestamp": metricTimestamp,
				"dissolvedOxygen_result":                 qualityBand(dissolvedOxygen, 7.8, 10.5, 6.6, 11.8),
				"dissolvedOxygen_calculatedValue":        clampFloat(dissolvedOxygen-rng.Float64()*0.4, 4.0, 13.2),
			}

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
			`imageUrl ~ "uploads/waterbag/gbg_seed_"`,
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

func pickWaterbagSpot(rng *rand.Rand, spots []waterbagSeedSpot) waterbagSeedSpot {
	totalWeight := 0
	for _, spot := range spots {
		totalWeight += spot.weight
	}

	pick := rng.Intn(totalWeight)
	for _, spot := range spots {
		pick -= spot.weight
		if pick < 0 {
			return spot
		}
	}

	return spots[0]
}

func qualityBand(value float64, optimalLow float64, optimalHigh float64, goodLow float64, goodHigh float64) int {
	switch {
	case value >= optimalLow && value <= optimalHigh:
		return 1
	case value >= goodLow && value <= goodHigh:
		return 2
	case value >= goodLow-0.6 && value <= goodHigh+0.6:
		return 3
	case value >= goodLow-1.2 && value <= goodHigh+1.2:
		return 4
	default:
		return 5
	}
}

func qualityBandInverse(value float64, optimalLow float64, optimalHigh float64, goodLow float64, goodHigh float64) int {
	switch {
	case value >= goodLow && value <= optimalLow:
		return 1
	case value > optimalLow && value <= optimalHigh:
		return 2
	case value > optimalHigh && value <= goodHigh:
		return 3
	case value > goodHigh && value <= goodHigh*1.35:
		return 4
	default:
		return 5
	}
}

func sanitizeSlug(value string) string {
	output := make([]rune, 0, len(value))
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			output = append(output, r)
			continue
		}
		if r >= 'A' && r <= 'Z' {
			output = append(output, r+('a'-'A'))
			continue
		}
		if r == ' ' || r == '-' || r == '_' {
			output = append(output, '_')
		}
	}
	if len(output) == 0 {
		return "spot"
	}
	return string(output)
}
