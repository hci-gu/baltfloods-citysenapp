package migrations

import (
	"fmt"
	"math/rand"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		city := currentSeedCity()

		if err := relocateSeededStormObservations(app, city); err != nil {
			return err
		}
		if err := relocateSeededWaterbagObservations(app, city); err != nil {
			return err
		}
		return relocateSeededOverflowObservations(app, city)
	}, func(app core.App) error {
		return nil
	})
}

func relocateSeededStormObservations(app core.App, city seedCity) error {
	records, err := findSeededObservationRecords(
		app,
		`type = "storm_water" && name ~ "Seed Storm "`,
	)
	if err != nil {
		return err
	}

	rng := rand.New(rand.NewSource(1770001401))
	spots := cityStormSeedSpots(city)
	for index, record := range records {
		spot := pickStormSpot(rng, spots)
		record.Set("name", fmt.Sprintf("Seed Storm %s %03d", spot.name, index+1))
		record.Set("latitude", spot.latitude+rng.NormFloat64()*0.0018)
		record.Set("longitude", spot.longitude+rng.NormFloat64()*0.0022)
		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
}

func relocateSeededWaterbagObservations(app core.App, city seedCity) error {
	records, err := findSeededObservationRecords(
		app,
		`type = "waterbag_testkit" && name ~ "Seed Waterbag " && imageUrl = "/assets/images/waterbag_testkit.jpg"`,
	)
	if err != nil {
		return err
	}

	rng := rand.New(rand.NewSource(1770001402))
	spots := cityWaterbagSeedSpots(city)
	for index, record := range records {
		spot := pickWaterbagSpot(rng, spots)
		record.Set("name", fmt.Sprintf("Seed Waterbag %s %03d", spot.name, index+1))
		record.Set("latitude", spot.latitude+rng.NormFloat64()*0.0022)
		record.Set("longitude", spot.longitude+rng.NormFloat64()*0.0028)
		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
}

func relocateSeededOverflowObservations(app core.App, city seedCity) error {
	records, err := findSeededObservationRecords(
		app,
		`type = "water_overflow" && name ~ "Seed Overflow " && imageUrl = "/assets/images/water_overflow.jpg"`,
	)
	if err != nil {
		return err
	}

	rng := rand.New(rand.NewSource(1770001403))
	spots := cityOverflowSeedSpots(city)
	regularIndex := 0
	recentIndex := 0
	for _, record := range records {
		spot := pickOverflowSpot(rng, spots)
		namePrefix := "Seed Overflow"
		sequence := 0
		if strings.Contains(record.GetString("name"), "Seed Overflow Recent ") {
			namePrefix = "Seed Overflow Recent"
			recentIndex++
			sequence = recentIndex
		} else {
			regularIndex++
			sequence = regularIndex
		}

		record.Set("name", fmt.Sprintf("%s %s %03d", namePrefix, spot.name, sequence))
		record.Set("latitude", spot.latitude+rng.NormFloat64()*0.0021)
		record.Set("longitude", spot.longitude+rng.NormFloat64()*0.0024)
		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
}

func findSeededObservationRecords(app core.App, filter string) ([]*core.Record, error) {
	_, err := app.FindCollectionByNameOrId("observations")
	if err != nil {
		return nil, nil
	}

	return app.FindRecordsByFilter("observations", filter, "+name", 0, 0)
}
