package migrations

import (
	"math"
	"os"
	"strconv"
	"strings"
)

const (
	defaultSeedCityName      = "Lappeenranta"
	defaultSeedCityLatitude  = 61.05871
	defaultSeedCityLongitude = 28.18871
)

var seededWaterbagUploadPrefixes = []string{
	"uploads/waterbag/seed_",
	"uploads/waterbag/gbg_seed_",
}

type seedCity struct {
	name      string
	latitude  float64
	longitude float64
}

func currentSeedCity() seedCity {
	latitude, longitude := seedCoordinatesFromEnv()
	name := firstNonEmptyEnv("CITYSEN_SEED_CITY", "CITYSEN_CITY_NAME", "CITYSEN_JURISDICTION")
	if name == "" {
		name = defaultSeedCityName
	}

	return seedCity{
		name:      name,
		latitude:  latitude,
		longitude: longitude,
	}
}

func seedCoordinatesFromEnv() (float64, float64) {
	latitude := defaultSeedCityLatitude
	longitude := defaultSeedCityLongitude

	if rawLocation := strings.TrimSpace(os.Getenv("CITYSEN_DEFAULT_LOCATION")); rawLocation != "" {
		parts := strings.Split(rawLocation, ",")
		if len(parts) == 2 {
			if parsedLatitude, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64); err == nil {
				latitude = parsedLatitude
			}
			if parsedLongitude, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64); err == nil {
				longitude = parsedLongitude
			}
		}
	}

	latitude = envFloat("CITYSEN_SEED_LATITUDE", envFloat("CITYSEN_DEFAULT_LATITUDE", latitude))
	longitude = envFloat("CITYSEN_SEED_LONGITUDE", envFloat("CITYSEN_DEFAULT_LONGITUDE", longitude))

	return latitude, longitude
}

func firstNonEmptyEnv(keys ...string) string {
	for _, key := range keys {
		value := strings.TrimSpace(os.Getenv(key))
		if value != "" {
			return value
		}
	}

	return ""
}

func envFloat(key string, fallback float64) float64 {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}

	return parsed
}

func seedSpotDisplayName(city seedCity, label string) string {
	if city.name == "" {
		return label
	}

	return city.name + " " + label
}

func seedOffsetCoordinate(city seedCity, northKm float64, eastKm float64) (float64, float64) {
	latitude := city.latitude + northKm/110.574
	longitudeScale := 111.320 * math.Cos(city.latitude*math.Pi/180.0)
	if math.Abs(longitudeScale) < 0.01 {
		return latitude, city.longitude
	}

	return latitude, city.longitude + eastKm/longitudeScale
}
