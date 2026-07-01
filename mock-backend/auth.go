package main

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func requireStreetAIKey(e *core.RequestEvent, expected string) error {
	if expected == "" {
		return nil
	}
	if e.Request.Header.Get("X-Api-Key") != expected {
		return apis.NewApiError(401, "Missing or invalid StreetAI API key.", nil)
	}
	return nil
}

func canViewHiddenObservations(e *core.RequestEvent) bool {
	return e.Auth != nil &&
		e.Auth.Collection() != nil &&
		e.Auth.Collection().Name == "users" &&
		e.Auth.GetString("type") == "admin"
}

func isObservationVisible(record *core.Record, includeHidden bool) bool {
	return includeHidden || record.GetBool("visible")
}
