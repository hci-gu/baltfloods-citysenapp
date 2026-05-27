package migrations

import (
	"fmt"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	seededWaterbagImageURL = "/assets/images/waterbag_testkit.jpg"
	seededOverflowImageURL = "/assets/images/water_overflow.jpg"
)

type overflowSeedSpot struct {
	name      string
	latitude  float64
	longitude float64
	weight    int
}

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("observations")
		if err != nil {
			return err
		}

		if err := normalizeSeededWaterbagRecords(app); err != nil {
			return err
		}

		const overflowSeedCount = 140
		now := time.Now()
		rng := rand.New(rand.NewSource(1770000400))
		spots := cityOverflowSeedSpots(currentSeedCity())

		for i := 0; i < overflowSeedCount; i++ {
			spot := pickOverflowSpot(rng, spots)
			timestamp := randomSeedTimestamp(rng, now, 3)

			record := core.NewRecord(collection)
			record.Load(map[string]any{
				"type":                   "water_overflow",
				"name":                   fmt.Sprintf("Seed Overflow %s %03d", spot.name, i+1),
				"latitude":               spot.latitude + rng.NormFloat64()*0.0021,
				"longitude":              spot.longitude + rng.NormFloat64()*0.0024,
				"dataRetrievedTimestamp": float64(timestamp.Unix()),
				"visible":                true,
				"imageUrl":               seededOverflowImageURL,
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
		overflowRecords, err := app.FindRecordsByFilter(
			"observations",
			`type = "water_overflow" && imageUrl = "/assets/images/water_overflow.jpg" && name ~ "Seed Overflow "`,
			"",
			0,
			0,
		)
		if err != nil {
			return err
		}

		for _, record := range overflowRecords {
			if err := app.Delete(record); err != nil {
				return err
			}
		}

		waterbagRecords, err := app.FindRecordsByFilter(
			"observations",
			`type = "waterbag_testkit" && imageUrl = "/assets/images/waterbag_testkit.jpg" && name ~ "Seed Waterbag "`,
			"",
			0,
			0,
		)
		if err != nil {
			return err
		}

		for _, record := range waterbagRecords {
			record.Set("name", record.Id)
			record.Set("imageUrl", "")
			if err := app.Save(record); err != nil {
				return err
			}
		}

		return nil
	})
}

func normalizeSeededWaterbagRecords(app core.App) error {
	for _, prefix := range seededWaterbagUploadPrefixes {
		records, err := app.FindRecordsByFilter(
			"observations",
			fmt.Sprintf(`type = "waterbag_testkit" && imageUrl ~ "%s"`, prefix),
			"",
			0,
			0,
		)
		if err != nil {
			return err
		}

		for _, record := range records {
			name := seededWaterbagNameFromImage(record.GetString("imageUrl"))
			if name == "" {
				shortID := record.Id
				if len(shortID) > 6 {
					shortID = shortID[:6]
				}
				name = fmt.Sprintf("Seed Waterbag %s", strings.ToUpper(shortID))
			}

			record.Set("name", name)
			record.Set("imageUrl", seededWaterbagImageURL)

			if err := app.Save(record); err != nil {
				return err
			}
		}
	}

	return nil
}

func seededWaterbagNameFromImage(imageURL string) string {
	const suffix = ".jpg"

	for _, prefix := range seededWaterbagUploadPrefixes {
		if !strings.HasPrefix(imageURL, prefix) || !strings.HasSuffix(imageURL, suffix) {
			continue
		}

		token := strings.TrimSuffix(strings.TrimPrefix(imageURL, prefix), suffix)
		lastSeparator := strings.LastIndex(token, "_")
		if lastSeparator <= 0 || lastSeparator >= len(token)-1 {
			return ""
		}

		slug := token[:lastSeparator]
		seqText := token[lastSeparator+1:]
		seq, err := strconv.Atoi(seqText)
		if err != nil {
			return ""
		}

		spot := humanizeSeedSlug(slug)
		if spot == "" {
			return fmt.Sprintf("Seed Waterbag %03d", seq)
		}

		return fmt.Sprintf("Seed Waterbag %s %03d", spot, seq)
	}

	return ""
}

func humanizeSeedSlug(slug string) string {
	parts := strings.Split(slug, "_")
	words := make([]string, 0, len(parts))

	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		lower := strings.ToLower(part)
		words = append(words, strings.ToUpper(lower[:1])+lower[1:])
	}

	return strings.Join(words, " ")
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
