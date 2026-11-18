package demo

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/pocketbase/pocketbase/core"
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

func generateWaterbag(app core.App, collection *core.Collection, city seedCity, now time.Time, rng *rand.Rand) error {
	const waterbagSeedCount = 10
	spots := cityWaterbagSeedSpots(city)

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

		latitude, longitude := seedOffsetCoordinate(seedCity{latitude: spot.latitude, longitude: spot.longitude}, rng.NormFloat64()*0.2, rng.NormFloat64()*0.2)
		data := map[string]any{
			"name":                                   fmt.Sprintf("Seed Waterbag %s %03d", spot.name, i+1),
			"coords_latitudeValue":                   latitude,
			"coords_longitudeValue":                  longitude,
			"dataRetrievedTimestamp":                 metricTimestamp,
			"imageUrl":                               "/assets/images/waterbag_testkit.jpg",
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

		record := observationFromMetrics(collection, "waterbag_testkit", data)
		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
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

func cityWaterbagSeedSpots(city seedCity) []waterbagSeedSpot {
	return []waterbagSeedSpot{
		newWaterbagSeedSpot(city, "Central Shore", 0.0, 0.0, 2.8, 3.0, 1.4, 0.18, 4),
		newWaterbagSeedSpot(city, "West Shore", -0.2, -1.4, 3.2, 2.9, 1.3, 0.16, 3),
		newWaterbagSeedSpot(city, "Central Waterfront", 0.15, 0.3, 2.6, 3.5, 1.6, 0.21, 5),
		newWaterbagSeedSpot(city, "East Shore", 0.45, 1.2, 2.4, 3.8, 1.8, 0.23, 5),
		newWaterbagSeedSpot(city, "Urban Canal", -0.6, -0.5, 2.9, 2.8, 1.2, 0.15, 3),
		newWaterbagSeedSpot(city, "Harbor Edge", 0.7, -2.4, 2.2, 4.1, 1.9, 0.27, 2),
		newWaterbagSeedSpot(city, "Park Wetland", -1.4, 1.1, 2.5, 3.6, 1.7, 0.22, 4),
	}
}

func newWaterbagSeedSpot(
	city seedCity,
	label string,
	northKm float64,
	eastKm float64,
	visibility float64,
	turbidity float64,
	nitrate float64,
	phosphate float64,
	weight int,
) waterbagSeedSpot {
	latitude, longitude := seedOffsetCoordinate(city, northKm, eastKm)

	return waterbagSeedSpot{
		name:       seedSpotDisplayName(city, label),
		latitude:   latitude,
		longitude:  longitude,
		visibility: visibility,
		turbidity:  turbidity,
		nitrate:    nitrate,
		phosphate:  phosphate,
		weight:     weight,
	}
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
