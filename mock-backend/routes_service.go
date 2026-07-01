package main

import (
	"net/http"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func registerServiceRoutes(se *core.ServeEvent) {
	serviceGroup := se.Router.Group("/service-api")
	serviceGroup.GET("/services.json", func(e *core.RequestEvent) error {
		records, err := fetchRecords(se.App, "service_api_services", "")
		if err != nil {
			return apis.NewApiError(500, "Failed to load service definitions.", err)
		}
		return e.JSON(http.StatusOK, mapServiceDefinitions(records))
	})
	serviceGroup.POST("/requests.json", func(e *core.RequestEvent) error {
		record, err := createServiceRequest(se.App, e)
		if err != nil {
			return err
		}
		return e.JSON(http.StatusOK, map[string]any{
			"email": record.GetRaw("email"),
		})
	})
}
