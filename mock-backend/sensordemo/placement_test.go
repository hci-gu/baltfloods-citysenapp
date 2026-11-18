package sensordemo

import (
	"app/demo"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestPlacementUsesActualShoreAndPrefersNamedRiver(t *testing.T) {
	client := &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		if r.Method != "POST" {
			t.Fatal("expected bounded POST query")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"elements":[
   {"type":"way","id":1,"tags":{"natural":"water"},"geometry":[{"lat":0.005,"lon":-0.01},{"lat":0.005,"lon":0.01},{"lat":0.02,"lon":0.01},{"lat":0.02,"lon":-0.01},{"lat":0.005,"lon":-0.01}]},
   {"type":"way","id":2,"tags":{"waterway":"river","name":"Test river"},"geometry":[{"lat":0.006,"lon":-0.01},{"lat":0.006,"lon":0.01}]}
  ]}`))}, nil
	})}
	p, err := Lookup(client, "https://example.test", demo.Origin{Latitude: 0, Longitude: 0})
	if err != nil {
		t.Fatal(err)
	}
	if p.FeatureID != "way/2" || p.Latitude != 0.006 || p.Longitude != 0 || p.Source != "OpenStreetMap" {
		t.Fatalf("bad river placement: %#v", p)
	}
	// A polygon without a river must choose its edge, not its centre.
	shore, err := choosePlacement(demo.Origin{}, []element{{Type: "way", ID: 1, Tags: map[string]string{"natural": "water"}, Geometry: []coordinate{{Lat: .005, Lon: -.01}, {Lat: .005, Lon: .01}, {Lat: .02, Lon: .01}}}})
	if err != nil || shore.Latitude != .005 || shore.Longitude != 0 {
		t.Fatalf("not on nearest shore: %#v, %v", shore, err)
	}
}

func TestNoWaterDoesNotInventLocation(t *testing.T) {
	if _, err := choosePlacement(demo.Origin{}, nil); err == nil {
		t.Fatal("expected manual placement required")
	}
	if err := (Placement{Latitude: 2, Longitude: 2}).Validate(demo.Origin{}); err == nil {
		t.Fatal("accepted sensor outside locality")
	}
}

func TestClippedGeometryDoesNotInventZeroCoordinates(t *testing.T) {
	var elements []element
	err := json.Unmarshal([]byte(`[
 {"type":"way","id":1,"tags":{"waterway":"river"},"geometry":[null,{"lat":0.006,"lon":-0.01},{"lat":0.006,"lon":0.01},null]},
 {"type":"way","id":2,"tags":{"bridge":"yes"},"geometry":[null,{"lat":0.006,"lon":0},null]}
 ]`), &elements)
	if err != nil {
		t.Fatal(err)
	}
	p, err := choosePlacement(demo.Origin{}, elements)
	if err != nil || p.Latitude != .006 || p.Longitude != 0 {
		t.Fatalf("clipped geometry misplaced sensor: %#v %v", p, err)
	}
}

func TestIncompleteLookupIsNotAcceptedAsAValidLocation(t *testing.T) {
	client := &http.Client{Transport: transportFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"remark":"runtime error: query ran out of memory","elements":[{"type":"way","id":1,"tags":{"waterway":"river"},"geometry":[{"lat":0.006,"lon":-0.01},{"lat":0.006,"lon":0.01}]}]}`))}, nil
	})}
	if _, err := Lookup(client, "https://example.test", demo.Origin{}); err == nil {
		t.Fatal("partial water lookup accepted")
	}
}
