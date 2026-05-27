package migrations

import (
	"fmt"
	"math"
	"math/rand"
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

type stormSeedSpot struct {
	name                string
	latitude            float64
	longitude           float64
	waterLevelBase      float64
	conductivityBase    float64
	turbidityBase       float64
	flowRateBase        float64
	waterTemperatureMid float64
	weight              int
}

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("streetai_storm_water")
		if err != nil {
			return err
		}

		const stormSeedCount = 160
		now := time.Now()
		rng := rand.New(rand.NewSource(1767789710))
		spots := cityStormSeedSpots(currentSeedCity())

		for i := 0; i < stormSeedCount; i++ {
			spot := pickStormSpot(rng, spots)
			timestamp := randomSeedTimestamp(rng, now, 3)
			season := seasonalFactor(timestamp)

			waterLevel := clampFloat(spot.waterLevelBase+rng.NormFloat64()*0.18+season*0.08, 0.2, 2.4)
			fillLevelValue := clampFloat(0.16+waterLevel/2.8+rng.NormFloat64()*0.08, 0.05, 0.95)
			fillLevelResult := 1
			switch {
			case fillLevelValue > 0.7:
				fillLevelResult = 3
			case fillLevelValue > 0.42:
				fillLevelResult = 2
			}

			turbidity := clampFloat(spot.turbidityBase+rng.NormFloat64()*0.9+(1.0-season)*0.4, 0.5, 8.0)
			waterQuality := 1
			switch {
			case turbidity > 6.0:
				waterQuality = 5
			case turbidity > 4.8:
				waterQuality = 4
			case turbidity > 3.6:
				waterQuality = 3
			case turbidity > 2.2:
				waterQuality = 2
			}

			data := map[string]any{
				"name":                   fmt.Sprintf("Seed Storm %s %03d", spot.name, i+1),
				"latitude":               spot.latitude + rng.NormFloat64()*0.0018,
				"longitude":              spot.longitude + rng.NormFloat64()*0.0022,
				"dataRetrievedTimestamp": float64(timestamp.Unix()),
				"waterLevel":             waterLevel,
				"waterTemperature":       clampFloat(spot.waterTemperatureMid+season*8.0+rng.NormFloat64()*1.4, 0.0, 22.0),
				"electricalConductivity": clampFloat(spot.conductivityBase+rng.NormFloat64()*35.0-season*28.0, 340, 780),
				"turbidity":              turbidity,
				"flowRate":               clampFloat(spot.flowRateBase+rng.NormFloat64()*0.11+(1.0-season)*0.04, 0.05, 1.4),
				"fillLevel_value":        fillLevelValue,
				"fillLevel_result":       fillLevelResult,
				"waterQuality":           waterQuality,
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
			"streetai_storm_water",
			`name ~ "Seed Storm "`,
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

func pickStormSpot(rng *rand.Rand, spots []stormSeedSpot) stormSeedSpot {
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

func cityStormSeedSpots(city seedCity) []stormSeedSpot {
	return []stormSeedSpot{
		newStormSeedSpot(city, "Central Waterfront", 0.0, 0.0, 0.95, 520, 3.1, 0.42, 7.8, 4),
		newStormSeedSpot(city, "East Waterfront", 0.45, 1.2, 1.08, 545, 3.3, 0.47, 8.2, 5),
		newStormSeedSpot(city, "West Canal", -0.15, -1.3, 0.88, 500, 2.8, 0.35, 8.0, 3),
		newStormSeedSpot(city, "Harbor Basin", -0.9, -2.2, 1.02, 565, 3.6, 0.52, 7.5, 2),
		newStormSeedSpot(city, "Inner Canal", -0.55, -0.45, 0.84, 515, 2.9, 0.33, 8.1, 2),
		newStormSeedSpot(city, "South Runoff", -1.35, 0.9, 0.91, 530, 3.4, 0.38, 7.7, 3),
	}
}

func newStormSeedSpot(
	city seedCity,
	label string,
	northKm float64,
	eastKm float64,
	waterLevelBase float64,
	conductivityBase float64,
	turbidityBase float64,
	flowRateBase float64,
	waterTemperatureMid float64,
	weight int,
) stormSeedSpot {
	latitude, longitude := seedOffsetCoordinate(city, northKm, eastKm)

	return stormSeedSpot{
		name:                seedSpotDisplayName(city, label),
		latitude:            latitude,
		longitude:           longitude,
		waterLevelBase:      waterLevelBase,
		conductivityBase:    conductivityBase,
		turbidityBase:       turbidityBase,
		flowRateBase:        flowRateBase,
		waterTemperatureMid: waterTemperatureMid,
		weight:              weight,
	}
}

func randomSeedTimestamp(rng *rand.Rand, now time.Time, spanYears int) time.Time {
	spanSeconds := int64(spanYears * 365 * 24 * 60 * 60)
	base := now.Add(-time.Duration(spanSeconds) * time.Second)

	// Bias slightly towards more recent records while still covering the full range.
	normalized := math.Pow(rng.Float64(), 0.78)
	offsetSeconds := int64(float64(spanSeconds) * normalized)
	candidate := base.Add(time.Duration(offsetSeconds) * time.Second)

	// Mild seasonal weighting: more uploads during warmer months.
	weight := 0.55
	month := candidate.Month()
	if month >= time.May && month <= time.September {
		weight = 1.0
	} else if month == time.April || month == time.October {
		weight = 0.75
	}
	if rng.Float64() > weight {
		return randomSeedTimestamp(rng, now, spanYears)
	}

	return candidate
}

func seasonalFactor(timestamp time.Time) float64 {
	// January ~ -1.0, July ~ +1.0
	radians := 2 * math.Pi * (float64(timestamp.YearDay()) / 365.0)
	return math.Sin(radians - math.Pi/2)
}

func clampFloat(value float64, min float64, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
