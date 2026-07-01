package main

import (
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func registerMessageRoutes(se *core.ServeEvent) {
	messageGroup := se.Router.Group("/messages")
	messageGroup.GET("/active", func(e *core.RequestEvent) error {
		records, err := findActiveScheduledMessages(se.App, time.Now().UTC())
		if err != nil {
			return apis.NewApiError(500, "Failed to load active scheduled messages.", err)
		}
		return e.JSON(http.StatusOK, mapScheduledMessages(records))
	})
	messageGroup.POST("/alert", func(e *core.RequestEvent) error {
		if !canViewHiddenObservations(e) {
			return apis.NewForbiddenError("Only admin users can send messages.", nil)
		}

		record, err := createImmediateScheduledAlert(se.App, e)
		if err != nil {
			return err
		}

		return e.JSON(http.StatusOK, mapScheduledMessage(record))
	})
}
