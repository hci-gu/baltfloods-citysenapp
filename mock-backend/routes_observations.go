package main

import (
	"net/http"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func registerObservationRoutes(se *core.ServeEvent) {
	observationGroup := se.Router.Group("/observation")
	observationGroup.GET("/water", func(e *core.RequestEvent) error {
		records, err := fetchRecords(se.App, "observations", "")
		if err != nil {
			return apis.NewApiError(500, "Failed to load water observations.", err)
		}
		return e.JSON(http.StatusOK, mapWaterObservations(records, canViewHiddenObservations(e)))
	})
	observationGroup.POST("/water", func(e *core.RequestEvent) error {
		record, err := createWaterObservation(se.App, e)
		if err != nil {
			return err
		}
		return e.JSON(http.StatusOK, map[string]any{
			"id": record.Id,
		})
	})
}
