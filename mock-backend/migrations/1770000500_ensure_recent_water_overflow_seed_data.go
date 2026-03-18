package migrations

import (
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	recentOverflowTargetCount = 24
	recentOverflowSeedImage   = "/assets/images/water_overflow.jpg"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("observations")
		if err != nil {
			return err
		}

		now := time.Now()
		cutoff := now.AddDate(0, 0, -30).Unix()

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

		recentCount := 0
		for _, record := range records {
			data := unifiedValueAsMap(record.GetRaw("data"))
			if !isWaterOverflowObservation(data) {
				continue
			}

			timestamp := int64(unifiedToFloatOr(
				record.GetRaw("dataRetrievedTimestamp"),
				float64(unifiedResolveTimestamp(record)),
			))
			if timestamp >= cutoff {
				recentCount++
			}
		}

		if recentCount >= recentOverflowTargetCount {
			return nil
		}

		missingCount := recentOverflowTargetCount - recentCount
		rng := rand.New(rand.NewSource(1770000500))
		spots := []overflowSeedSpot{
			{name: "Lilla Bommen", latitude: 57.70690, longitude: 11.97980, weight: 4},
			{name: "Opera", latitude: 57.70630, longitude: 11.96690, weight: 4},
			{name: "Stigbergskajen", latitude: 57.70195, longitude: 11.94090, weight: 3},
			{name: "Klippan", latitude: 57.70685, longitude: 11.95525, weight: 3},
			{name: "Masthuggskajen", latitude: 57.69860, longitude: 11.94670, weight: 2},
			{name: "Eriksberg", latitude: 57.70855, longitude: 11.91580, weight: 2},
		}

		for i := 0; i < missingCount; i++ {
			spot := pickOverflowSpot(rng, spots)
			timestamp := now.Add(-time.Duration(rng.Intn(30*24)) * time.Hour)

			record := core.NewRecord(collection)
			record.Load(map[string]any{
				"type":                   "water_overflow",
				"name":                   fmt.Sprintf("Seed Overflow Recent %s %03d", spot.name, i+1),
				"latitude":               spot.latitude + rng.NormFloat64()*0.0018,
				"longitude":              spot.longitude + rng.NormFloat64()*0.0021,
				"dataRetrievedTimestamp": float64(timestamp.Unix()),
				"visible":                true,
				"imageUrl":               recentOverflowSeedImage,
				"data": map[string]any{
					"observationType": "water_overflow",
				},
			})
			if err := app.Save(record); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		records, err := app.FindRecordsByFilter(
			"observations",
			`type = "water_overflow" && imageUrl = "/assets/images/water_overflow.jpg" && name ~ "Seed Overflow Recent "`,
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

func isWaterOverflowObservation(data map[string]any) bool {
	if len(data) == 0 {
		return false
	}

	raw, ok := data["observationType"]
	if !ok || raw == nil {
		return false
	}

	observationType, ok := raw.(string)
	if !ok {
		return false
	}

	return strings.TrimSpace(observationType) == "water_overflow"
}
