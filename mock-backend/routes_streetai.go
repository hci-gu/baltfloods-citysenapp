package main

import (
	"net/http"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func registerStreetAIRoutes(se *core.ServeEvent, streetAIKey string) {
	streetGroup := se.Router.Group("/street-ai")
	streetGroup.GET("/{jurisdictionId}/weather/conditions", func(e *core.RequestEvent) error {
		if err := requireStreetAIKey(e, streetAIKey); err != nil {
			return err
		}
		records, err := fetchRecords(se.App, "streetai_weather_conditions", e.Request.PathValue("jurisdictionId"))
		if err != nil {
			return apis.NewApiError(500, "Failed to load weather conditions.", err)
		}
		return e.JSON(http.StatusOK, mapWeatherConditions(records))
	})
	streetGroup.GET("/{jurisdictionId}/weather/air-quality", func(e *core.RequestEvent) error {
		if err := requireStreetAIKey(e, streetAIKey); err != nil {
			return err
		}
		records, err := fetchRecords(se.App, "streetai_air_quality", e.Request.PathValue("jurisdictionId"))
		if err != nil {
			return apis.NewApiError(500, "Failed to load air quality data.", err)
		}
		return e.JSON(http.StatusOK, mapAirQuality(records))
	})
	streetGroup.GET("/{jurisdictionId}/weather/storm-water", func(e *core.RequestEvent) error {
		if err := requireStreetAIKey(e, streetAIKey); err != nil {
			return err
		}
		records, err := fetchRecords(se.App, "observations", e.Request.PathValue("jurisdictionId"))
		if err != nil {
			return apis.NewApiError(500, "Failed to load storm water data.", err)
		}
		return e.JSON(http.StatusOK, mapStormWater(records, canViewHiddenObservations(e)))
	})
	streetGroup.GET("/{jurisdictionId}/parking", func(e *core.RequestEvent) error {
		if err := requireStreetAIKey(e, streetAIKey); err != nil {
			return err
		}
		records, err := fetchRecords(se.App, "streetai_parking", e.Request.PathValue("jurisdictionId"))
		if err != nil {
			return apis.NewApiError(500, "Failed to load parking data.", err)
		}
		return e.JSON(http.StatusOK, mapParking(records))
	})
	streetGroup.GET("/{jurisdictionId}/road-works", func(e *core.RequestEvent) error {
		if err := requireStreetAIKey(e, streetAIKey); err != nil {
			return err
		}
		records, err := fetchRecords(se.App, "streetai_road_works", e.Request.PathValue("jurisdictionId"))
		if err != nil {
			return apis.NewApiError(500, "Failed to load road works data.", err)
		}
		return e.JSON(http.StatusOK, mapRoadWorks(records))
	})
	streetGroup.GET("/{jurisdictionId}/waterbag-testkit", func(e *core.RequestEvent) error {
		if err := requireStreetAIKey(e, streetAIKey); err != nil {
			return err
		}
		records, err := fetchRecords(se.App, "observations", e.Request.PathValue("jurisdictionId"))
		if err != nil {
			return apis.NewApiError(500, "Failed to load waterbag testkit data.", err)
		}
		return e.JSON(http.StatusOK, mapWaterbagTestkit(records, canViewHiddenObservations(e)))
	})
}
