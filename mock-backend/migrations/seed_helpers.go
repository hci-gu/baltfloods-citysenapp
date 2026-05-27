package migrations

import "math"

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
	return seedCity{
		name:      defaultSeedCityName,
		latitude:  defaultSeedCityLatitude,
		longitude: defaultSeedCityLongitude,
	}
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
