package main

import (
	"encoding/json"
	"fmt"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

type PushSubscriptionPayload struct {
	Endpoint       string   `json:"endpoint"`
	ExpirationTime *float64 `json:"expirationTime"`
	Keys           struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

type PushTestRequest struct {
	Title    string `json:"title"`
	Body     string `json:"body"`
	Icon     string `json:"icon"`
	Url      string `json:"url"`
	Endpoint string `json:"endpoint"`
}

func readPushPayload(e *core.RequestEvent) (*PushSubscriptionPayload, error) {
	decoder := json.NewDecoder(e.Request.Body)
	var payload PushSubscriptionPayload
	if err := decoder.Decode(&payload); err != nil {
		return nil, apis.NewApiError(400, "Invalid push subscription payload.", err)
	}
	if payload.Endpoint == "" {
		return nil, apis.NewApiError(400, "Missing push subscription endpoint.", nil)
	}
	return &payload, nil
}

func upsertPushSubscription(app core.App, payload *PushSubscriptionPayload, userAgent string) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("push_subscriptions")
	if err != nil {
		return nil, apis.NewApiError(500, "Missing push_subscriptions collection.", err)
	}

	records, err := app.FindRecordsByFilter(
		collection.Name,
		"endpoint = {:endpoint}",
		"",
		0,
		1,
		dbx.Params{"endpoint": payload.Endpoint},
	)
	if err != nil {
		return nil, apis.NewApiError(500, "Failed to query push subscriptions.", err)
	}

	var record *core.Record
	if len(records) > 0 {
		record = records[0]
	} else {
		record = core.NewRecord(collection)
	}

	record.Set("endpoint", payload.Endpoint)
	record.Set("p256dh", payload.Keys.P256dh)
	record.Set("auth", payload.Keys.Auth)
	record.Set("userAgent", userAgent)
	if payload.ExpirationTime != nil {
		record.Set("expirationTime", *payload.ExpirationTime)
	}

	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "Failed to store push subscription.", err)
	}

	return record, nil
}

func deletePushSubscription(app core.App, endpoint string) error {
	collection, err := app.FindCollectionByNameOrId("push_subscriptions")
	if err != nil {
		return apis.NewApiError(500, "Missing push_subscriptions collection.", err)
	}

	records, err := app.FindRecordsByFilter(
		collection.Name,
		"endpoint = {:endpoint}",
		"",
		0,
		0,
		dbx.Params{"endpoint": endpoint},
	)
	if err != nil {
		return apis.NewApiError(500, "Failed to query push subscriptions.", err)
	}

	for _, record := range records {
		if err := app.Delete(record); err != nil {
			return apis.NewApiError(500, "Failed to delete push subscription.", err)
		}
	}

	return nil
}

func readPushTestPayload(e *core.RequestEvent) (*PushTestRequest, error) {
	decoder := json.NewDecoder(e.Request.Body)
	var payload PushTestRequest
	if err := decoder.Decode(&payload); err != nil {
		return nil, apis.NewApiError(400, "Invalid push test payload.", err)
	}
	if payload.Title == "" {
		return nil, apis.NewApiError(400, "Missing notification title.", nil)
	}
	return &payload, nil
}

func findPushSubscriptions(app core.App, endpoint string) ([]*webpush.Subscription, error) {
	collection, err := app.FindCollectionByNameOrId("push_subscriptions")
	if err != nil {
		return nil, apis.NewApiError(500, "Missing push_subscriptions collection.", err)
	}

	filter := ""
	params := dbx.Params{}
	if endpoint != "" {
		filter = "endpoint = {:endpoint}"
		params["endpoint"] = endpoint
	}

	records, err := app.FindRecordsByFilter(collection.Name, filter, "", 0, 0, params)
	if err != nil {
		return nil, apis.NewApiError(500, "Failed to query push subscriptions.", err)
	}

	subscriptions := make([]*webpush.Subscription, 0, len(records))
	for _, record := range records {
		subscriptions = append(subscriptions, &webpush.Subscription{
			Endpoint: record.GetString("endpoint"),
			Keys: webpush.Keys{
				P256dh: record.GetString("p256dh"),
				Auth:   record.GetString("auth"),
			},
		})
	}

	return subscriptions, nil
}

func buildPushPayload(request *PushTestRequest) ([]byte, error) {
	notification := map[string]any{
		"title": request.Title,
		"body":  request.Body,
	}
	if request.Icon != "" {
		notification["icon"] = request.Icon
	}
	if request.Url != "" {
		notification["data"] = map[string]any{
			"url": request.Url,
		}
	}

	payload := map[string]any{
		"notification": notification,
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return nil, apis.NewApiError(500, "Failed to encode push payload.", err)
	}

	return data, nil
}

func sendWebPush(payload []byte, subscription *webpush.Subscription, options *webpush.Options) (int, error) {
	response, err := webpush.SendNotification(payload, subscription, options)
	if response == nil {
		return 0, err
	}
	defer response.Body.Close()

	status := response.StatusCode
	if status < 200 || status >= 300 {
		if err == nil {
			err = fmt.Errorf("push service responded with status %d", status)
		}
	}

	return status, err
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
