package sensordemo

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"app/demo"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type Resolver func(demo.Origin) (Placement, error)

type coordinate struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// Clipped Overpass geometries contain null nodes outside the requested area.
// Mark them unusable instead of turning them into coordinates at (0, 0).
func (c *coordinate) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		c.Lat = math.NaN()
		c.Lon = math.NaN()
		return nil
	}
	type plain coordinate
	return json.Unmarshal(data, (*plain)(c))
}

type element struct {
	Type     string            `json:"type"`
	ID       int64             `json:"id"`
	Tags     map[string]string `json:"tags"`
	Geometry []coordinate      `json:"geometry"`
	Members  []struct {
		Role     string       `json:"role"`
		Geometry []coordinate `json:"geometry"`
	} `json:"members"`
}

func Distance(lat1, lon1, lat2, lon2 float64) float64 {
	rad := math.Pi / 180
	a := math.Pow(math.Sin((lat2-lat1)*rad/2), 2) + math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Pow(math.Sin((lon2-lon1)*rad/2), 2)
	return 6371000 * 2 * math.Asin(math.Sqrt(math.Min(1, a)))
}

func OriginKey(o demo.Origin) string { return fmt.Sprintf("%.8f,%.8f", o.Latitude, o.Longitude) }

func Resolve(app core.App, o demo.Origin, automatic ...bool) (Placement, error) {
	if r, err := app.FindFirstRecordByFilter("sensor_placements", "originKey = {:key}", dbx.Params{"key": OriginKey(o)}); err == nil {
		var p Placement
		if r.UnmarshalJSONField("placement", &p) == nil && p.Validate(o) == nil && !(len(automatic) > 0 && automatic[0] && p.Source == "manual") {
			return p, nil
		}
	}
	endpoint := os.Getenv("OVERPASS_API_URL")
	if endpoint == "" {
		endpoint = "https://overpass-api.de/api/interpreter"
	}
	return Lookup(&http.Client{Timeout: 15 * time.Second}, endpoint, o)
}

func Remember(app core.App, o demo.Origin, p Placement) error {
	r, err := app.FindFirstRecordByFilter("sensor_placements", "originKey = {:key}", dbx.Params{"key": OriginKey(o)})
	if err != nil {
		c, e := app.FindCollectionByNameOrId("sensor_placements")
		if e != nil {
			return e
		}
		r = core.NewRecord(c)
	}
	r.Set("originKey", OriginKey(o))
	r.Set("placement", p)
	return app.Save(r)
}

func Lookup(client *http.Client, endpoint string, o demo.Origin) (Placement, error) {
	longitudeRadius := .05 / math.Max(.01, math.Cos(o.Latitude*math.Pi/180))
	query := fmt.Sprintf(`[out:json][timeout:10][maxsize:134217728];(way(around:5000,%f,%f)[waterway~"^(river|canal|stream)$"];way(around:5000,%f,%f)[natural=water];relation(around:5000,%f,%f)[natural=water];way(around:5000,%f,%f)[bridge][highway];);out geom(%f,%f,%f,%f);`, o.Latitude, o.Longitude, o.Latitude, o.Longitude, o.Latitude, o.Longitude, o.Latitude, o.Longitude, math.Max(-90, o.Latitude-.05), math.Max(-180, o.Longitude-longitudeRadius), math.Min(90, o.Latitude+.05), math.Min(180, o.Longitude+longitudeRadius))
	request, err := http.NewRequest(http.MethodPost, endpoint, strings.NewReader(url.Values{"data": {query}}.Encode()))
	if err != nil {
		return Placement{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "CitySen/1.0 (demo sensor water placement)")
	resp, err := client.Do(request)
	if err != nil {
		return Placement{}, fmt.Errorf("water lookup unavailable; choose a water-side point on the map: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Placement{}, fmt.Errorf("water lookup returned %d; choose a water-side point on the map", resp.StatusCode)
	}
	var data struct {
		Elements []element `json:"elements"`
		Remark   string    `json:"remark"`
	}
	if err = json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&data); err != nil {
		return Placement{}, fmt.Errorf("water lookup could not be read; choose a water-side point on the map")
	}
	if data.Remark != "" {
		return Placement{}, fmt.Errorf("water lookup could not complete; try again or choose a water-side point on the map")
	}
	return choosePlacement(o, data.Elements)
}

// Use actual line/shore geometry, never a polygon's centre (which may be inland
// or in the middle of a lake). Nearby bridges improve a candidate's rank.
func choosePlacement(o demo.Origin, elements []element) (Placement, error) {
	bestScore := math.Inf(1)
	var best Placement
	bridges := []coordinate{}
	for _, e := range elements {
		if e.Tags["bridge"] != "" && e.Tags["bridge"] != "no" {
			for _, b := range e.Geometry {
				if !math.IsNaN(b.Lat) && !math.IsNaN(b.Lon) {
					bridges = append(bridges, b)
				}
			}
		}
	}
	for _, e := range elements {
		waterway := e.Tags["waterway"]
		if e.Tags["natural"] != "water" && waterway != "river" && waterway != "canal" && waterway != "stream" {
			continue
		}
		lines := [][]coordinate{e.Geometry}
		for _, m := range e.Members {
			if m.Role == "outer" || m.Role == "" {
				lines = append(lines, m.Geometry)
			}
		}
		for _, line := range lines {
			for i := 1; i < len(line); i++ {
				p := nearestPoint(o, line[i-1], line[i])
				distance := Distance(o.Latitude, o.Longitude, p.Lat, p.Lon)
				if distance > 5000 {
					continue
				}
				score := distance
				if e.Tags["name"] == "" {
					score += 400
				}
				if waterway != "river" && waterway != "canal" {
					score += 250
				}
				bridgeDistance := 500.0
				for _, b := range bridges {
					bridgeDistance = math.Min(bridgeDistance, Distance(p.Lat, p.Lon, b.Lat, b.Lon))
				}
				score += bridgeDistance
				if score < bestScore {
					bestScore = score
					name := strings.TrimSpace(e.Tags["name"])
					if name == "" {
						name = "Nearby waterway"
						if waterway == "" {
							name = "Nearby shoreline"
						}
					}
					best = Placement{Latitude: p.Lat, Longitude: p.Lon, Name: name, FeatureID: fmt.Sprintf("%s/%d", e.Type, e.ID), Source: "OpenStreetMap"}
				}
			}
		}
	}
	if math.IsInf(bestScore, 1) {
		return Placement{}, fmt.Errorf("no suitable waterway or shoreline found within 5 km; choose a water-side point on the map")
	}
	return best, best.Validate(o)
}

func nearestPoint(o demo.Origin, a, b coordinate) coordinate {
	scale := math.Cos(o.Latitude * math.Pi / 180)
	ax := (a.Lon - o.Longitude) * scale
	ay := a.Lat - o.Latitude
	bx := (b.Lon - o.Longitude) * scale
	by := b.Lat - o.Latitude
	dx, dy := bx-ax, by-ay
	den := dx*dx + dy*dy
	t := 0.0
	if den > 0 {
		t = math.Max(0, math.Min(1, -(ax*dx+ay*dy)/den))
	}
	return coordinate{Lat: a.Lat + t*(b.Lat-a.Lat), Lon: a.Lon + t*(b.Lon-a.Lon)}
}
