package main

import (
	"net/http"
	"os"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func registerPushRoutes(se *core.ServeEvent) {
	pushGroup := se.Router.Group("/push")
	pushGroup.POST("/subscribe", func(e *core.RequestEvent) error {
		payload, err := readPushPayload(e)
		if err != nil {
			return err
		}
		record, err := upsertPushSubscription(se.App, payload, e.Request.UserAgent())
		if err != nil {
			return err
		}
		return e.JSON(http.StatusOK, map[string]any{
			"id": record.Id,
		})
	})
	pushGroup.POST("/unsubscribe", func(e *core.RequestEvent) error {
		payload, err := readPushPayload(e)
		if err != nil {
			return err
		}
		if err := deletePushSubscription(se.App, payload.Endpoint); err != nil {
			return err
		}
		return e.JSON(http.StatusOK, map[string]any{
			"ok": true,
		})
	})
	pushGroup.POST("/test", func(e *core.RequestEvent) error {
		request, err := readPushTestPayload(e)
		if err != nil {
			return err
		}
		vapidSubject := os.Getenv("VAPID_SUBJECT")
		vapidPublicKey := os.Getenv("VAPID_PUBLIC_KEY")
		vapidPrivateKey := os.Getenv("VAPID_PRIVATE_KEY")
		if vapidSubject == "" || vapidPublicKey == "" || vapidPrivateKey == "" {
			return apis.NewApiError(500, "Missing VAPID configuration.", nil)
		}

		subscriptions, err := findPushSubscriptions(se.App, request.Endpoint)
		if err != nil {
			return err
		}

		payload, err := buildPushPayload(request)
		if err != nil {
			return err
		}

		options := &webpush.Options{
			Subscriber:      vapidSubject,
			VAPIDPublicKey:  vapidPublicKey,
			VAPIDPrivateKey: vapidPrivateKey,
			TTL:             60,
		}

		results := make([]map[string]any, 0, len(subscriptions))
		for _, subscription := range subscriptions {
			status, sendErr := sendWebPush(payload, subscription, options)
			results = append(results, map[string]any{
				"endpoint": subscription.Endpoint,
				"status":   status,
				"ok":       sendErr == nil,
				"error":    errorMessage(sendErr),
			})
			if status == http.StatusNotFound || status == http.StatusGone {
				_ = deletePushSubscription(se.App, subscription.Endpoint)
			}
		}

		return e.JSON(http.StatusOK, map[string]any{
			"sent":    len(results),
			"results": results,
		})
	}).Bind(apis.RequireSuperuserAuth())
}
