package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		weatherConditions := core.NewCollection(core.CollectionTypeBase, "streetai_weather_conditions")
		weatherConditions.Fields = core.NewFieldsList(
			&core.TextField{Name: "name"},
			&core.NumberField{Name: "latitude"},
			&core.NumberField{Name: "longitude"},
			&core.NumberField{Name: "dataRetrievedTimestamp"},
			&core.NumberField{Name: "temperature"},
			&core.NumberField{Name: "humidity"},
			&core.NumberField{Name: "visibility"},
			&core.NumberField{Name: "pressure"},
			&core.NumberField{Name: "dewPoint"},
			&core.NumberField{Name: "windDirection"},
			&core.NumberField{Name: "windSpeed"},
			&core.NumberField{Name: "windGust"},
			&core.NumberField{Name: "cloudCover"},
			&core.NumberField{Name: "snowDepth"},
			&core.NumberField{Name: "friction"},
			&core.NumberField{Name: "ice"},
			&core.SelectField{
				Name:      "streetState",
				Values:    []string{"dry", "moist", "wet", "slushy", "snowy", "icy"},
				MaxSelect: 1,
			},
		)
		if err := app.Save(weatherConditions); err != nil {
			return err
		}

		airQuality := core.NewCollection(core.CollectionTypeBase, "streetai_air_quality")
		airQuality.Fields = core.NewFieldsList(
			&core.TextField{Name: "name"},
			&core.NumberField{Name: "latitude"},
			&core.NumberField{Name: "longitude"},
			&core.NumberField{Name: "dataRetrievedTimestamp"},
			&core.NumberField{Name: "measurementIndex"},
		)
		if err := app.Save(airQuality); err != nil {
			return err
		}

		stormWater := core.NewCollection(core.CollectionTypeBase, "streetai_storm_water")
		stormWater.Fields = core.NewFieldsList(
			&core.TextField{Name: "name"},
			&core.NumberField{Name: "latitude"},
			&core.NumberField{Name: "longitude"},
			&core.NumberField{Name: "dataRetrievedTimestamp"},
			&core.NumberField{Name: "waterLevel"},
			&core.NumberField{Name: "waterTemperature"},
			&core.NumberField{Name: "electricalConductivity"},
			&core.NumberField{Name: "turbidity"},
			&core.NumberField{Name: "flowRate"},
			&core.NumberField{Name: "fillLevel_value"},
			&core.NumberField{Name: "fillLevel_result"},
			&core.NumberField{Name: "waterQuality"},
		)
		if err := app.Save(stormWater); err != nil {
			return err
		}

		parking := core.NewCollection(core.CollectionTypeBase, "streetai_parking")
		parking.Fields = core.NewFieldsList(
			&core.TextField{Name: "name"},
			&core.NumberField{Name: "latitude"},
			&core.NumberField{Name: "longitude"},
			&core.SelectField{
				Name:      "dataSource",
				Values:    []string{"PARKING_FINNPARK", "PARKING_AIMOPARK"},
				MaxSelect: 1,
			},
			&core.NumberField{Name: "dataRetrievedTimestamp"},
			&core.NumberField{Name: "availableSpots"},
			&core.NumberField{Name: "capacity"},
		)
		if err := app.Save(parking); err != nil {
			return err
		}

		roadWorks := core.NewCollection(core.CollectionTypeBase, "streetai_road_works")
		roadWorks.Fields = core.NewFieldsList(
			&core.TextField{Name: "name"},
			&core.NumberField{Name: "latitude"},
			&core.NumberField{Name: "longitude"},
			&core.TextField{Name: "validityPeriod"},
		)
		if err := app.Save(roadWorks); err != nil {
			return err
		}

		waterbag := core.NewCollection(core.CollectionTypeBase, "streetai_waterbag_testkit")
		waterbag.Fields = core.NewFieldsList(
			&core.NumberField{Name: "coords_latitudeValue"},
			&core.NumberField{Name: "coords_longitudeValue"},
			&core.NumberField{Name: "dataRetrievedTimestamp"},
			&core.TextField{Name: "imageUrl"},
			&core.NumberField{Name: "airTemp_value"},
			&core.NumberField{Name: "airTemp_dataRetrievedTimestamp"},
			&core.NumberField{Name: "waterTemp_value"},
			&core.NumberField{Name: "waterTemp_dataRetrievedTimestamp"},
			&core.NumberField{Name: "visibility_value"},
			&core.NumberField{Name: "visibility_dataRetrievedTimestamp"},
			&core.NumberField{Name: "algae_value"},
			&core.NumberField{Name: "algae_dataRetrievedTimestamp"},
			&core.NumberField{Name: "waterPh_value"},
			&core.NumberField{Name: "waterPh_dataRetrievedTimestamp"},
			&core.NumberField{Name: "waterPh_result"},
			&core.NumberField{Name: "turbidity_value"},
			&core.NumberField{Name: "turbidity_dataRetrievedTimestamp"},
			&core.NumberField{Name: "turbidity_result"},
			&core.NumberField{Name: "nitrate_value"},
			&core.NumberField{Name: "nitrate_dataRetrievedTimestamp"},
			&core.NumberField{Name: "nitrate_result"},
			&core.NumberField{Name: "phosphate_value"},
			&core.NumberField{Name: "phosphate_dataRetrievedTimestamp"},
			&core.NumberField{Name: "phosphate_result"},
			&core.NumberField{Name: "dissolvedOxygen_value"},
			&core.NumberField{Name: "dissolvedOxygen_dataRetrievedTimestamp"},
			&core.NumberField{Name: "dissolvedOxygen_result"},
			&core.NumberField{Name: "dissolvedOxygen_calculatedValue"},
		)
		if err := app.Save(waterbag); err != nil {
			return err
		}

		serviceDefinitions := core.NewCollection(core.CollectionTypeBase, "service_api_services")
		serviceDefinitions.Fields = core.NewFieldsList(
			&core.TextField{Name: "service_code"},
			&core.TextField{Name: "service_name"},
			&core.TextField{Name: "description"},
			&core.BoolField{Name: "metadata"},
			&core.TextField{Name: "type"},
			&core.TextField{Name: "keywords"},
			&core.TextField{Name: "group"},
		)
		if err := app.Save(serviceDefinitions); err != nil {
			return err
		}

		serviceRequests := core.NewCollection(core.CollectionTypeBase, "service_api_requests")
		serviceRequests.Fields = core.NewFieldsList(
			&core.TextField{Name: "api_key"},
			&core.TextField{Name: "service_code"},
			&core.TextField{Name: "lat"},
			&core.TextField{Name: "long"},
			&core.TextField{Name: "email"},
			&core.TextField{Name: "first_name"},
			&core.TextField{Name: "last_name"},
			&core.TextField{Name: "phone"},
			&core.TextField{Name: "description"},
			&core.FileField{Name: "media", MaxSelect: 10},
		)
		return app.Save(serviceRequests)
	}, func(app core.App) error {
		collections := []string{
			"service_api_requests",
			"service_api_services",
			"streetai_waterbag_testkit",
			"streetai_road_works",
			"streetai_parking",
			"streetai_storm_water",
			"streetai_air_quality",
			"streetai_weather_conditions",
		}

		for _, name := range collections {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil || collection == nil {
				continue
			}
			if err := app.Delete(collection); err != nil {
				return err
			}
		}
		return nil
	})
}
