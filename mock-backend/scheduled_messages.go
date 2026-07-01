package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/routine"
	"github.com/pocketbase/pocketbase/tools/subscriptions"
)

type ImmediateScheduledAlertRequest struct {
	Title         string  `json:"title"`
	Content       string  `json:"content"`
	Type          string  `json:"type"`
	DurationHours float64 `json:"durationHours"`
}

func broadcastScheduledMessagesRefresh(app core.App) {
	message := subscriptions.Message{
		Name: scheduledMessagesRefreshTopic,
		Data: []byte(`{"action":"create"}`),
	}

	for _, client := range app.SubscriptionsBroker().Clients() {
		if !client.HasSubscription(scheduledMessagesRefreshTopic) {
			continue
		}

		currentClient := client
		routine.FireAndForget(func() {
			currentClient.Send(message)
		})
	}
}

func findActiveScheduledMessages(app core.App, now time.Time) ([]*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("scheduled_messages")
	if err != nil {
		return []*core.Record{}, nil
	}

	records, err := app.FindRecordsByFilter(collection.Name, "", "+start", 0, 0)
	if err != nil {
		return nil, err
	}

	activeRecords := make([]*core.Record, 0, len(records))
	for _, record := range records {
		start := record.GetDateTime("start")
		end := record.GetDateTime("end")
		if start.IsZero() || end.IsZero() {
			continue
		}

		startTime := start.Time()
		endTime := end.Time()
		if endTime.Before(startTime) {
			continue
		}

		if !now.Before(startTime) && !now.After(endTime) {
			activeRecords = append(activeRecords, record)
		}
	}

	sort.Slice(activeRecords, func(i, j int) bool {
		return activeRecords[i].
			GetDateTime("start").
			Time().
			Before(activeRecords[j].GetDateTime("start").Time())
	})

	return activeRecords, nil
}

func mapScheduledMessages(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, mapScheduledMessage(record))
	}
	return items
}

func mapScheduledMessage(record *core.Record) map[string]any {
	messageType := record.GetString("type")
	if messageType != "warning" {
		messageType = "info"
	}

	return map[string]any{
		"id":      record.Id,
		"title":   record.GetString("title"),
		"content": record.GetString("content"),
		"start":   record.GetDateTime("start").String(),
		"end":     record.GetDateTime("end").String(),
		"type":    messageType,
	}
}

func createImmediateScheduledAlert(app core.App, e *core.RequestEvent) (*core.Record, error) {
	decoder := json.NewDecoder(e.Request.Body)
	var payload ImmediateScheduledAlertRequest
	if err := decoder.Decode(&payload); err != nil {
		return nil, apis.NewApiError(400, "Invalid message payload.", err)
	}

	title := strings.TrimSpace(payload.Title)
	content := strings.TrimSpace(payload.Content)
	if title == "" || content == "" {
		return nil, apis.NewBadRequestError("Message title and content are required.", nil)
	}

	messageType := strings.TrimSpace(payload.Type)
	if messageType == "" {
		messageType = "info"
	}
	if messageType != "info" && messageType != "warning" {
		return nil, apis.NewBadRequestError("Message type must be info or warning.", nil)
	}

	durationHours := payload.DurationHours
	if durationHours <= 0 {
		durationHours = 2
	}
	if durationHours > 168 {
		durationHours = 168
	}

	collection, err := app.FindCollectionByNameOrId("scheduled_messages")
	if err != nil {
		return nil, apis.NewApiError(500, "Missing scheduled_messages collection.", err)
	}

	now := time.Now().UTC()
	record := core.NewRecord(collection)
	record.Set("name", fmt.Sprintf("admin-message-%d", now.Unix()))
	record.Set("title", title)
	record.Set("content", content)
	record.Set("type", messageType)
	record.Set("start", now)
	record.Set("end", now.Add(time.Duration(durationHours*float64(time.Hour))))

	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "Failed to save alert.", err)
	}

	broadcastScheduledMessagesRefresh(app)

	return record, nil
}
