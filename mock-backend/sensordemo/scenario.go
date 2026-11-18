package sensordemo

import (
	"fmt"
	"math"
	"math/rand"
	"time"

	"app/demo"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const SensorID = "floodsensor0001"
const RunID = "floodrun0000001"
const ScenarioVersion = 1

var Stages = map[string]int64{"normal": 0, "rising": 6 * 3600, "warning": 12 * 3600, "peak": 18 * 3600, "recovery": 72 * 3600}

type Placement struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Name      string  `json:"name"`
	FeatureID string  `json:"featureId"`
	Source    string  `json:"source"`
}

func (p Placement) Validate(origin demo.Origin) error {
	if math.IsNaN(p.Latitude) || math.IsNaN(p.Longitude) || math.IsInf(p.Latitude, 0) || math.IsInf(p.Longitude, 0) || math.Abs(p.Latitude) > 90 || math.Abs(p.Longitude) > 180 {
		return fmt.Errorf("choose valid sensor coordinates between ±90 latitude and ±180 longitude")
	}
	if Distance(origin.Latitude, origin.Longitude, p.Latitude, p.Longitude) > 5000 {
		return fmt.Errorf("choose a sensor within 5 km of the map origin")
	}
	return nil
}

func Thresholds() map[string]any {
	return map[string]any{"unitLabel": "m (local reference)", "warningMaxAgeHours": 12, "bands": []map[string]any{
		{"id": "watch", "severity": "yellow", "value": 1.5},
		{"id": "warning", "severity": "orange", "value": 2.0},
		{"id": "critical", "severity": "red", "value": 2.8},
	}}
}

// Generate participates in the caller's transaction. The seed and scenario
// version make the baseline and flood shape reproducible after every reset.
func Generate(app core.App, origin demo.Origin, placement Placement, now time.Time) error {
	if err := placement.Validate(origin); err != nil {
		return err
	}
	sensor, err := app.FindRecordById("sensors", SensorID)
	if err != nil {
		return err
	}
	sensor.Set("name", "Demo water-level sensor")
	sensor.Set("latitude", placement.Latitude)
	sensor.Set("longitude", placement.Longitude)
	sensor.Set("placement", placement)
	sensor.Set("ready", true)
	sensor.Set("simulated", true)
	sensor.Set("thresholds", Thresholds())
	sensor.Set("unit", "m (local reference)")
	if err = app.Save(sensor); err != nil {
		return err
	}
	run, err := app.FindRecordById("demo_runs", RunID)
	if err != nil {
		return err
	}
	seed := int64(run.GetInt("seed"))
	if seed == 0 {
		seed = 20260921
	}
	anchor := now.UTC().Truncate(time.Hour).Add(-72 * time.Hour).Unix()
	if _, err = app.DB().NewQuery("DELETE FROM sensor_readings WHERE sensor = {:sensor}").Bind(dbx.Params{"sensor": SensorID}).Execute(); err != nil {
		return err
	}
	readings, err := app.FindCollectionByNameOrId("sensor_readings")
	if err != nil {
		return err
	}
	rng := rand.New(rand.NewSource(seed))
	save := func(timestamp int64, value float64) error {
		record := core.NewRecord(readings)
		record.Set("sensor", SensorID)
		record.Set("timestamp", timestamp)
		record.Set("value", math.Round(value*1000)/1000)
		return app.Save(record)
	}
	// Three years of daily history, then hourly history for the last month.
	for offset := int64(-3 * 365 * 86400); offset < -30*86400; offset += 86400 {
		value := 1 + 0.15*math.Sin(float64(offset)/86400*2*math.Pi/365) + rng.NormFloat64()*0.025
		if err = save(anchor+offset, value); err != nil {
			return err
		}
	}
	for offset := int64(-30 * 86400); offset < 0; offset += 3600 {
		if err = save(anchor+offset, 1+0.05*math.Sin(float64(offset)/3600)+rng.NormFloat64()*0.02); err != nil {
			return err
		}
	}
	// Fifteen-minute readings for the complete flood and recovery.
	for offset := int64(0); offset <= 72*3600; offset += 900 {
		if err = save(anchor+offset, FloodValue(float64(offset)/3600)); err != nil {
			return err
		}
	}
	run.Set("sensor", SensorID)
	run.Set("stage", "normal")
	run.Set("anchor", anchor)
	run.Set("cursor", anchor)
	run.Set("seed", seed)
	run.Set("scenarioVersion", ScenarioVersion)
	run.Set("revision", run.GetInt("revision")+1)
	run.Set("placementError", "")
	return app.Save(run)
}

func FloodValue(hour float64) float64 {
	knots := [][2]float64{{0, 1}, {6, 1.7}, {12, 2.3}, {18, 3.2}, {24, 2.4}, {36, 1}, {72, 1}}
	for i := 1; i < len(knots); i++ {
		if hour <= knots[i][0] {
			a, b := knots[i-1], knots[i]
			return a[1] + (b[1]-a[1])*(hour-a[0])/(b[0]-a[0])
		}
	}
	return 1
}

func Advance(app core.App, stage string, expectedRevision int) error {
	offset, ok := Stages[stage]
	if !ok {
		return fmt.Errorf("unknown demo stage")
	}
	return app.RunInTransaction(func(tx core.App) error {
		sensor, err := tx.FindRecordById("sensors", SensorID)
		if err != nil {
			return err
		}
		if !sensor.GetBool("ready") {
			return fmt.Errorf("place the demo sensor first")
		}
		run, err := tx.FindRecordById("demo_runs", RunID)
		if err != nil {
			return err
		}
		if run.GetInt("revision") != expectedRevision {
			return fmt.Errorf("demo changed in another session; refresh and try again")
		}
		if run.GetString("stage") == stage {
			return nil
		}
		run.Set("stage", stage)
		run.Set("cursor", int64(run.GetInt("anchor"))+offset)
		run.Set("revision", expectedRevision+1)
		return tx.Save(run)
	})
}
