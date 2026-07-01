package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"
	"github.com/pocketbase/pocketbase/tools/routine"
	"github.com/pocketbase/pocketbase/tools/subscriptions"
)

func broadcastObservationRefresh(app core.App, action string) {
	message := subscriptions.Message{
		Name: observationRefreshTopic,
		Data: []byte(`{"action":"` + action + `"}`),
	}

	for _, client := range app.SubscriptionsBroker().Clients() {
		if !client.HasSubscription(observationRefreshTopic) {
			continue
		}

		currentClient := client
		routine.FireAndForget(func() {
			currentClient.Send(message)
		})
	}
}

func createWaterObservation(app core.App, e *core.RequestEvent) (*core.Record, error) {
	if err := e.Request.ParseMultipartForm(router.DefaultMaxMemory); err != nil {
		return nil, apis.NewApiError(400, "Invalid multipart form payload.", err)
	}

	collection, err := app.FindCollectionByNameOrId("observations")
	if err != nil {
		return nil, apis.NewApiError(500, "Missing observations collection.", err)
	}

	record := core.NewRecord(collection)
	isAuthenticatedUser := e.Auth != nil &&
		e.Auth.Collection() != nil &&
		e.Auth.Collection().Name == "users"
	if isAuthenticatedUser && collection.Fields.GetByName("user") != nil {
		record.Set("user", e.Auth.Id)
	}
	if collection.Fields.GetByName("visible") != nil {
		record.Set("visible", isAuthenticatedUser)
	}

	if err := setRequiredNumber(record, "latitude", e.Request.FormValue("latitude")); err != nil {
		return nil, err
	}
	if err := setRequiredNumber(record, "longitude", e.Request.FormValue("longitude")); err != nil {
		return nil, err
	}

	observationType := e.Request.FormValue("observationType")
	if observationType == "" {
		return nil, apis.NewApiError(400, "Missing observation type.", nil)
	}
	if observationType != "water_system" &&
		observationType != "stormwater" &&
		observationType != "water_overflow" {
		return nil, apis.NewApiError(400, "Invalid observation type.", nil)
	}
	isWaterOverflowObservation := observationType == "water_overflow"
	if isWaterOverflowObservation {
		record.Set("type", observationTypeWaterOverflow)
	} else {
		record.Set("type", observationTypeWaterbagTestkit)
	}

	observationTime := time.Now().UTC()
	timestamp := observationTime.Unix()
	record.Set("dataRetrievedTimestamp", float64(timestamp))
	record.Set("name", fmt.Sprintf("Observation %s %d", observationType, timestamp))

	data := map[string]any{
		"observationType": observationType,
	}

	if !isWaterOverflowObservation {
		identificationCode := e.Request.FormValue("identificationCode")
		if identificationCode == "" {
			return nil, apis.NewApiError(400, "Missing identification code.", nil)
		}
		data["identificationCode"] = identificationCode

		if value := e.Request.FormValue("airTemp"); value != "" {
			if numeric, ok := parseOptionalNumber(value); ok {
				data["airTemp"] = numeric
			}
		}
		if value := e.Request.FormValue("waterTemp"); value != "" {
			if numeric, ok := parseOptionalNumber(value); ok {
				data["waterTemp"] = numeric
			}
		}
		if value := e.Request.FormValue("depthOfView"); value != "" {
			if numeric, ok := parseOptionalNumber(value); ok {
				data["depthOfView"] = numeric
			}
		}
		if value := e.Request.FormValue("waterPh"); value != "" {
			if numeric, ok := parseOptionalNumber(value); ok {
				data["waterPh"] = numeric
			}
		}
		if value := e.Request.FormValue("turbidity"); value != "" {
			if numeric, ok := parseOptionalNumber(value); ok {
				data["turbidity"] = numeric
			}
		}
		if value := e.Request.FormValue("dissolvedOxygen"); value != "" {
			if numeric, ok := parseOptionalNumber(value); ok {
				data["dissolvedOxygen"] = numeric
			}
		}
		if value := e.Request.FormValue("nitrate"); value != "" {
			if numeric, ok := parseOptionalNumber(value); ok {
				data["nitrate"] = numeric
			}
		}
		if value := e.Request.FormValue("phosphate"); value != "" {
			if numeric, ok := parseOptionalNumber(value); ok {
				data["phosphate"] = numeric
			}
		}

		termsAccepted, err := parseBoolField(e.Request.FormValue("termsAccepted"))
		if err != nil {
			return nil, apis.NewApiError(400, "Invalid terms acceptance value.", err)
		}
		cc0Accepted, err := parseBoolField(e.Request.FormValue("cc0Accepted"))
		if err != nil {
			return nil, apis.NewApiError(400, "Invalid CC0 acceptance value.", err)
		}
		if !termsAccepted || !cc0Accepted {
			return nil, apis.NewApiError(400, "Terms must be accepted.", nil)
		}
		data["termsAccepted"] = termsAccepted
		data["cc0Accepted"] = cc0Accepted

		if value := e.Request.FormValue("algaeLevel"); value != "" {
			if _, ok := algaeLevelToValue(value); ok {
				data["algaeLevel"] = value
			}
		}
	}
	record.Set("data", data)

	files := make([]*filesystem.File, 0)
	if e.Request.MultipartForm != nil {
		for _, fh := range e.Request.MultipartForm.File["photo"] {
			file, err := filesystem.NewFileFromMultipart(fh)
			if err != nil {
				return nil, apis.NewApiError(400, "Failed to read uploaded photo.", err)
			}
			files = append(files, file)
		}
	}
	if len(files) > 0 {
		record.Set("photo", files)
	}
	if isWaterOverflowObservation && len(files) == 0 {
		return nil, apis.NewApiError(400, "Missing overflow photo.", nil)
	}

	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "Failed to store observation.", err)
	}
	if ensureObservationImageURL(record) {
		if err := app.Save(record); err != nil {
			return nil, apis.NewApiError(500, "Failed to store observation image URL.", err)
		}
	}

	return record, nil
}

func setRequiredNumber(record *core.Record, field string, raw string) error {
	if raw == "" {
		return apis.NewApiError(400, "Missing numeric value.", nil)
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return apis.NewApiError(400, "Invalid numeric value.", err)
	}
	record.Set(field, value)
	return nil
}

func parseOptionalNumber(raw string) (float64, bool) {
	if raw == "" {
		return 0, false
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, false
	}
	return value, true
}

func parseBoolField(raw string) (bool, error) {
	if raw == "" {
		return false, nil
	}
	return strconv.ParseBool(raw)
}

func resolveObservationTimestamp(record *core.Record) int64 {
	if value := record.GetRaw("dataRetrievedTimestamp"); value != nil {
		if floatValue, ok := toFloatFromAny(value); ok {
			return int64(floatValue)
		}
	}
	return resolveRecordTimestamp(record)
}

func observationData(record *core.Record) map[string]any {
	if data := valueAsMap(record.GetRaw("data")); data != nil {
		return data
	}
	return map[string]any{}
}

func valueAsMap(value any) map[string]any {
	switch typed := value.(type) {
	case map[string]any:
		return typed
	case string:
		if typed == "" {
			return nil
		}
		var parsed map[string]any
		if err := json.Unmarshal([]byte(typed), &parsed); err == nil {
			return parsed
		}
	case []byte:
		var parsed map[string]any
		if err := json.Unmarshal(typed, &parsed); err == nil {
			return parsed
		}
	}
	return nil
}

func metricWithOptionalFields(data map[string]any, key string, optionalFields ...string) map[string]any {
	metric := map[string]any{
		"value":                  nil,
		"dataRetrievedTimestamp": nil,
	}

	nested := valueAsMap(data[key])
	if nested != nil {
		metric["value"] = nested["value"]
		metric["dataRetrievedTimestamp"] = nested["dataRetrievedTimestamp"]
		for _, field := range optionalFields {
			metric[field] = nested[field]
		}
		return metric
	}

	metric["value"] = data[key+"_value"]
	metric["dataRetrievedTimestamp"] = data[key+"_dataRetrievedTimestamp"]
	for _, field := range optionalFields {
		metric[field] = data[key+"_"+field]
	}
	return metric
}

func observationImageURL(record *core.Record, collectionName string) string {
	_ = collectionName
	if value := strings.TrimSpace(record.GetString("imageUrl")); value != "" {
		return value
	}
	if filename := firstFileName(record.Get("photo")); filename != "" {
		return observationPhotoURL(record.Id, filename)
	}
	return ""
}

func firstFileName(value any) string {
	switch typed := value.(type) {
	case []string:
		if len(typed) > 0 {
			return typed[0]
		}
	case []*filesystem.File:
		for _, file := range typed {
			if file != nil {
				if file.Name != "" {
					return file.Name
				}
				if file.OriginalName != "" {
					return file.OriginalName
				}
			}
		}
	case []filesystem.File:
		for _, file := range typed {
			if file.Name != "" {
				return file.Name
			}
			if file.OriginalName != "" {
				return file.OriginalName
			}
		}
	case []any:
		for _, entry := range typed {
			if filename := firstFileName(entry); filename != "" {
				return filename
			}
		}
	case string:
		return typed
	}
	return ""
}

func ensureObservationImageURL(record *core.Record) bool {
	if strings.TrimSpace(record.GetString("imageUrl")) != "" {
		return false
	}
	filename := firstFileName(record.Get("photo"))
	if filename == "" {
		return false
	}
	record.Set("imageUrl", observationPhotoURL(record.Id, filename))
	return true
}

func observationPhotoURL(recordID string, filename string) string {
	return "/api/files/observations/" + recordID + "/" + url.PathEscape(filename)
}

func backfillObservationImageURLs(app core.App) error {
	records, err := fetchRecords(app, "observations", "")
	if err != nil {
		return err
	}

	for _, record := range records {
		if !ensureObservationImageURL(record) {
			continue
		}
		if err := app.Save(record); err != nil {
			return err
		}
	}

	return nil
}

func algaeLevelToValue(value string) (float64, bool) {
	switch value {
	case "none":
		return 1, true
	case "little":
		return 2, true
	case "rich":
		return 3, true
	case "very_rich":
		return 4, true
	default:
		return 0, false
	}
}

func mapAlgaeValueToLevel(value any) any {
	numeric, ok := toFloatFromAny(value)
	if !ok {
		return nil
	}
	switch numeric {
	case 1:
		return "none"
	case 2:
		return "little"
	case 3:
		return "rich"
	case 4:
		return "very_rich"
	default:
		return nil
	}
}
