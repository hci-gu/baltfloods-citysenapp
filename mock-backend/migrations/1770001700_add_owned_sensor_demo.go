package migrations

import (
	"app/sensordemo"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		public := ""
		sensors := core.NewBaseCollection("sensors")
		sensors.ListRule = &public
		sensors.ViewRule = &public
		sensors.Fields.Add(&core.TextField{Name: "name"}, &core.NumberField{Name: "latitude"}, &core.NumberField{Name: "longitude"}, &core.TextField{Name: "unit"}, &core.BoolField{Name: "simulated"}, &core.BoolField{Name: "ready"}, &core.JSONField{Name: "thresholds"}, &core.JSONField{Name: "placement"})
		if err := app.Save(sensors); err != nil {
			return err
		}
		readings := core.NewBaseCollection("sensor_readings")
		// History is served by the bounded API, which hides unreached scenario data.
		readings.Fields.Add(&core.RelationField{Name: "sensor", CollectionId: sensors.Id, MaxSelect: 1, Required: true, CascadeDelete: true}, &core.NumberField{Name: "timestamp", Required: true}, &core.NumberField{Name: "value"})
		readings.AddIndex("idx_sensor_time", true, "sensor,timestamp", "")
		if err := app.Save(readings); err != nil {
			return err
		}
		runs := core.NewBaseCollection("demo_runs")
		runs.ListRule = &public
		runs.ViewRule = &public
		runs.Fields.Add(&core.RelationField{Name: "sensor", CollectionId: sensors.Id, MaxSelect: 1, Required: true}, &core.TextField{Name: "stage"}, &core.NumberField{Name: "anchor"}, &core.NumberField{Name: "cursor"}, &core.NumberField{Name: "seed", OnlyInt: true}, &core.NumberField{Name: "scenarioVersion", OnlyInt: true}, &core.NumberField{Name: "revision", OnlyInt: true}, &core.TextField{Name: "placementError"})
		if err := app.Save(runs); err != nil {
			return err
		}
		placements := core.NewBaseCollection("sensor_placements")
		placements.Fields.Add(&core.TextField{Name: "originKey", Required: true}, &core.JSONField{Name: "placement", Required: true})
		placements.AddIndex("idx_placement_origin", true, "originKey", "")
		if err := app.Save(placements); err != nil {
			return err
		}
		sensor := core.NewRecord(sensors)
		sensor.Id = sensordemo.SensorID
		sensor.Set("name", "Demo water-level sensor")
		sensor.Set("simulated", true)
		sensor.Set("thresholds", sensordemo.Thresholds())
		sensor.Set("unit", "m (local reference)")
		if err := app.Save(sensor); err != nil {
			return err
		}
		run := core.NewRecord(runs)
		run.Id = sensordemo.RunID
		run.Set("sensor", sensor.Id)
		run.Set("stage", "unplaced")
		run.Set("revision", 1)
		run.Set("seed", 20260921)
		run.Set("scenarioVersion", sensordemo.ScenarioVersion)
		return app.Save(run)
	}, func(app core.App) error {
		for _, name := range []string{"sensor_placements", "sensor_readings", "demo_runs", "sensors"} {
			c, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			if err = app.Delete(c); err != nil {
				return err
			}
		}
		return nil
	})
}
