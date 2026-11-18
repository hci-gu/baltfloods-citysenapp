package demo

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

type overflowSeedSpot struct {
	name      string
	latitude  float64
	longitude float64
	weight    int
}

func generateOverflow(app core.App, collection *core.Collection, city seedCity, now time.Time, rng *rand.Rand) error {
	const overflowSeedCount = 10
	spots := cityOverflowSeedSpots(city)

	for i := 0; i < overflowSeedCount; i++ {
		spot := pickOverflowSpot(rng, spots)
		timestamp := randomSeedTimestamp(rng, now, 3)
		if i == 0 {
			// One current observation plus the owned sensor gives two demo
			// markers in the default view; the rest remain in history.
			timestamp = now.Add(-time.Hour)
		}
		latitude, longitude := seedOffsetCoordinate(seedCity{latitude: spot.latitude, longitude: spot.longitude}, rng.NormFloat64()*0.2, rng.NormFloat64()*0.2)

		record := core.NewRecord(collection)
		record.SetRaw(resetMarker, true)
		record.Load(map[string]any{
			"type":                   "water_overflow",
			"name":                   fmt.Sprintf("Seed Overflow %s %03d", spot.name, i+1),
			"latitude":               latitude,
			"longitude":              longitude,
			"dataRetrievedTimestamp": float64(timestamp.Unix()),
			"visible":                true,
			"demoGenerated":          true,
			"imageUrl":               "/assets/images/water_overflow.jpg",
			"data": map[string]any{
				"observationType": "water_overflow",
			},
		})
		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
}
func pickOverflowSpot(rng *rand.Rand, spots []overflowSeedSpot) overflowSeedSpot {
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

func cityOverflowSeedSpots(city seedCity) []overflowSeedSpot {
	return []overflowSeedSpot{
		newOverflowSeedSpot(city, "Low Point East", 0.45, 1.2, 4),
		newOverflowSeedSpot(city, "Central Waterfront", 0.15, 0.3, 4),
		newOverflowSeedSpot(city, "Harbor Basin", -0.9, -2.2, 3),
		newOverflowSeedSpot(city, "West Canal", -0.15, -1.3, 3),
		newOverflowSeedSpot(city, "South Runoff", -1.35, 0.9, 2),
		newOverflowSeedSpot(city, "North Inlet", 1.1, 0.6, 2),
	}
}

func newOverflowSeedSpot(
	city seedCity,
	label string,
	northKm float64,
	eastKm float64,
	weight int,
) overflowSeedSpot {
	latitude, longitude := seedOffsetCoordinate(city, northKm, eastKm)

	return overflowSeedSpot{
		name:      seedSpotDisplayName(city, label),
		latitude:  latitude,
		longitude: longitude,
		weight:    weight,
	}
}
