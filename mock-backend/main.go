package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/SherClockHolmes/webpush-go"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"

	_ "app/migrations"
)

const (
	observationTypeStormWater       = "storm_water"
	observationTypeWaterbagTestkit  = "waterbag_testkit"
	observationTypeWaterObservation = "water_observation"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		streetAIKey := os.Getenv("STREET_AI_API_KEY")

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
			return e.JSON(http.StatusOK, mapStormWater(records))
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
			return e.JSON(http.StatusOK, mapWaterbagTestkit(records))
		})

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

		observationGroup := se.Router.Group("/observation")
		observationGroup.GET("/water", func(e *core.RequestEvent) error {
			records, err := fetchRecords(se.App, "observations", "")
			if err != nil {
				return apis.NewApiError(500, "Failed to load water observations.", err)
			}
			return e.JSON(http.StatusOK, mapWaterObservations(records))
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

		messageGroup := se.Router.Group("/messages")
		messageGroup.GET("/active", func(e *core.RequestEvent) error {
			records, err := findActiveScheduledMessages(se.App, time.Now().UTC())
			if err != nil {
				return apis.NewApiError(500, "Failed to load active scheduled messages.", err)
			}
			return e.JSON(http.StatusOK, mapScheduledMessages(records))
		})

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

		// serves static files from the provided public dir (if exists)
		se.Router.GET("/{path...}", apis.Static(os.DirFS("./pb_public"), false))

		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func requireStreetAIKey(e *core.RequestEvent, expected string) error {
	if expected == "" {
		return nil
	}
	if e.Request.Header.Get("X-Api-Key") != expected {
		return apis.NewApiError(401, "Missing or invalid StreetAI API key.", nil)
	}
	return nil
}

func fetchRecords(app core.App, collectionName string, jurisdictionId string) ([]*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return nil, err
	}

	if jurisdictionId != "" && collection.Fields.GetByName("jurisdictionId") != nil {
		return app.FindRecordsByFilter(
			collectionName,
			"jurisdictionId = {:jurisdictionId}",
			"",
			0,
			0,
			dbx.Params{"jurisdictionId": jurisdictionId},
		)
	}

	return app.FindRecordsByFilter(collectionName, "", "", 0, 0)
}

func mapWeatherConditions(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"name":                   record.GetRaw("name"),
			"latitude":               record.GetRaw("latitude"),
			"longitude":              record.GetRaw("longitude"),
			"dataRetrievedTimestamp": record.GetRaw("dataRetrievedTimestamp"),
			"temperature":            record.GetRaw("temperature"),
			"humidity":               record.GetRaw("humidity"),
			"visibility":             record.GetRaw("visibility"),
			"pressure":               record.GetRaw("pressure"),
			"dewPoint":               record.GetRaw("dewPoint"),
			"windDirection":          record.GetRaw("windDirection"),
			"windSpeed":              record.GetRaw("windSpeed"),
			"windGust":               record.GetRaw("windGust"),
			"cloudCover":             record.GetRaw("cloudCover"),
			"snowDepth":              record.GetRaw("snowDepth"),
			"friction":               record.GetRaw("friction"),
			"ice":                    record.GetRaw("ice"),
			"streetState":            record.GetRaw("streetState"),
		})
	}
	return items
}

func mapAirQuality(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"name":                   record.GetRaw("name"),
			"latitude":               record.GetRaw("latitude"),
			"longitude":              record.GetRaw("longitude"),
			"dataRetrievedTimestamp": record.GetRaw("dataRetrievedTimestamp"),
			"measurementIndex":       record.GetRaw("measurementIndex"),
		})
	}
	return items
}

func mapStormWater(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		if record.GetString("type") != observationTypeStormWater {
			continue
		}

		data := observationData(record)
		fillLevel := valueAsMap(data["fillLevel"])
		if fillLevel == nil {
			fillLevel = map[string]any{
				"value":  data["fillLevel_value"],
				"result": data["fillLevel_result"],
			}
		}

		items = append(items, map[string]any{
			"name":      record.GetRaw("name"),
			"latitude":  record.GetRaw("latitude"),
			"longitude": record.GetRaw("longitude"),
			"dataRetrievedTimestamp": firstNonNil(
				record.GetRaw("dataRetrievedTimestamp"),
				int64(resolveObservationTimestamp(record)),
			),
			"waterLevel":             data["waterLevel"],
			"waterTemperature":       data["waterTemperature"],
			"electricalConductivity": data["electricalConductivity"],
			"turbidity":              data["turbidity"],
			"flowRate":               data["flowRate"],
			"fillLevel":              fillLevel,
			"waterQuality":           normalizeStormWaterQuality(data["waterQuality"]),
		})
	}
	return items
}

func normalizeStormWaterQuality(value any) int {
	const minQuality = 0
	const maxQuality = 6

	coerced := 0
	switch v := value.(type) {
	case int:
		coerced = v
	case int64:
		coerced = int(v)
	case float64:
		coerced = int(math.Round(v))
	case float32:
		coerced = int(math.Round(float64(v)))
	case string:
		if parsed, err := strconv.ParseFloat(v, 64); err == nil {
			coerced = int(math.Round(parsed))
		}
	}

	if coerced < minQuality {
		return minQuality
	}
	if coerced > maxQuality {
		return maxQuality
	}
	return coerced
}

func mapParking(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"name":                   record.GetRaw("name"),
			"latitude":               record.GetRaw("latitude"),
			"longitude":              record.GetRaw("longitude"),
			"dataSource":             record.GetRaw("dataSource"),
			"dataRetrievedTimestamp": record.GetRaw("dataRetrievedTimestamp"),
			"availableSpots":         record.GetRaw("availableSpots"),
			"capacity":               record.GetRaw("capacity"),
		})
	}
	return items
}

func mapRoadWorks(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"name":           record.GetRaw("name"),
			"latitude":       record.GetRaw("latitude"),
			"longitude":      record.GetRaw("longitude"),
			"validityPeriod": record.GetRaw("validityPeriod"),
		})
	}
	return items
}

func mapWaterbagTestkit(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		if record.GetString("type") != observationTypeWaterbagTestkit {
			continue
		}

		latitude := record.GetRaw("latitude")
		longitude := record.GetRaw("longitude")
		if latitude == nil || longitude == nil {
			continue
		}

		data := observationData(record)

		items = append(items, map[string]any{
			"id": record.Id,
			"coords": map[string]any{
				"latitudeValue":  latitude,
				"longitudeValue": longitude,
			},
			"dataRetrievedTimestamp": firstNonNil(
				record.GetRaw("dataRetrievedTimestamp"),
				int64(resolveObservationTimestamp(record)),
			),
			"imageUrl":   observationImageURL(record, "observations"),
			"airTemp":    metricWithOptionalFields(data, "airTemp"),
			"waterTemp":  metricWithOptionalFields(data, "waterTemp"),
			"visibility": metricWithOptionalFields(data, "visibility"),
			"algae":      metricWithOptionalFields(data, "algae"),
			"waterPh":    metricWithOptionalFields(data, "waterPh", "result"),
			"turbidity":  metricWithOptionalFields(data, "turbidity", "result"),
			"nitrate":    metricWithOptionalFields(data, "nitrate", "result"),
			"phosphate":  metricWithOptionalFields(data, "phosphate", "result"),
			"dissolvedOxygen": metricWithOptionalFields(
				data,
				"dissolvedOxygen",
				"result",
				"calculatedValue",
			),
		})
	}
	return items
}

func mapServiceDefinitions(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, map[string]any{
			"service_code": record.GetRaw("service_code"),
			"service_name": record.GetRaw("service_name"),
			"description":  record.GetRaw("description"),
			"metadata":     record.GetRaw("metadata"),
			"type":         record.GetRaw("type"),
			"keywords":     record.GetRaw("keywords"),
			"group":        record.GetRaw("group"),
		})
	}
	return items
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
		items = append(items, map[string]any{
			"id":      record.Id,
			"title":   record.GetString("title"),
			"content": record.GetString("content"),
			"start":   record.GetDateTime("start").String(),
			"end":     record.GetDateTime("end").String(),
		})
	}
	return items
}

func createServiceRequest(app core.App, e *core.RequestEvent) (*core.Record, error) {
	if err := e.Request.ParseMultipartForm(router.DefaultMaxMemory); err != nil {
		return nil, apis.NewApiError(400, "Invalid multipart form payload.", err)
	}

	collection, err := app.FindCollectionByNameOrId("service_api_requests")
	if err != nil {
		return nil, apis.NewApiError(500, "Missing service_api_requests collection.", err)
	}

	record := core.NewRecord(collection)
	record.Set("api_key", e.Request.FormValue("api_key"))
	record.Set("service_code", e.Request.FormValue("service_code"))
	record.Set("lat", e.Request.FormValue("lat"))
	record.Set("long", e.Request.FormValue("long"))

	if value := e.Request.FormValue("email"); value != "" {
		record.Set("email", value)
	}
	if value := e.Request.FormValue("first_name"); value != "" {
		record.Set("first_name", value)
	}
	if value := e.Request.FormValue("last_name"); value != "" {
		record.Set("last_name", value)
	}
	if value := e.Request.FormValue("phone"); value != "" {
		record.Set("phone", value)
	}
	if value := e.Request.FormValue("description"); value != "" {
		record.Set("description", value)
	}

	files := make([]*filesystem.File, 0)
	if e.Request.MultipartForm != nil {
		for _, key := range []string{"media[]", "media"} {
			for _, fh := range e.Request.MultipartForm.File[key] {
				file, err := filesystem.NewFileFromMultipart(fh)
				if err != nil {
					return nil, apis.NewApiError(400, "Failed to read uploaded media.", err)
				}
				files = append(files, file)
			}
		}
	}
	if len(files) > 0 {
		record.Set("media", files)
	}

	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "Failed to store service request.", err)
	}

	return record, nil
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
	record.Set("type", observationTypeWaterObservation)

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

	timestamp := time.Now().Unix()
	record.Set("dataRetrievedTimestamp", float64(timestamp))

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

	return record, nil
}

func mapWaterObservations(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		if record.GetString("type") != observationTypeWaterObservation {
			continue
		}

		data := observationData(record)
		imageUrl := observationImageURL(record, "observations")
		observationType := firstNonNil(data["observationType"], record.GetRaw("observationType"))
		if observationType == nil {
			continue
		}

		algaeLevel := data["algaeLevel"]
		if algaeLevel == nil {
			algaeLevel = mapAlgaeValueToLevel(data["algae_value"])
		} else if value, ok := algaeLevel.(string); ok && value == "" {
			algaeLevel = mapAlgaeValueToLevel(data["algae_value"])
		}

		items = append(items, map[string]any{
			"id":                     record.Id,
			"latitude":               firstNonNil(record.GetRaw("latitude"), data["latitude"]),
			"longitude":              firstNonNil(record.GetRaw("longitude"), data["longitude"]),
			"dataRetrievedTimestamp": resolveObservationTimestamp(record),
			"imageUrl":               imageUrl,
			"observationType":        observationType,
			"airTemp":                data["airTemp"],
			"waterTemp":              data["waterTemp"],
			"depthOfView":            data["depthOfView"],
			"algaeLevel":             algaeLevel,
			"waterPh":                data["waterPh"],
			"turbidity":              data["turbidity"],
			"dissolvedOxygen":        data["dissolvedOxygen"],
			"nitrate":                data["nitrate"],
			"phosphate":              data["phosphate"],
		})
	}
	return items
}

type PushSubscriptionPayload struct {
	Endpoint       string   `json:"endpoint"`
	ExpirationTime *float64 `json:"expirationTime"`
	Keys           struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
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

type PushTestRequest struct {
	Title    string `json:"title"`
	Body     string `json:"body"`
	Icon     string `json:"icon"`
	Url      string `json:"url"`
	Endpoint string `json:"endpoint"`
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

func resolveRecordTimestamp(record *core.Record) int64 {
	value := record.GetRaw("created")
	switch typed := value.(type) {
	case time.Time:
		return typed.Unix()
	case *time.Time:
		return typed.Unix()
	case string:
		if parsed, err := time.Parse(time.RFC3339Nano, typed); err == nil {
			return parsed.Unix()
		}
		if parsed, err := time.Parse(time.RFC3339, typed); err == nil {
			return parsed.Unix()
		}
	}
	return time.Now().Unix()
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
	if filename := firstFileName(record.Get("photo")); filename != "" {
		return "../api/files/" + collectionName + "/" + record.Id + "/" + filename
	}
	if value, ok := record.GetRaw("imageUrl").(string); ok {
		return value
	}
	return ""
}

func firstFileName(value any) string {
	switch typed := value.(type) {
	case []string:
		if len(typed) > 0 {
			return typed[0]
		}
	case string:
		return typed
	}
	return ""
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func toFloatFromAny(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case uint:
		return float64(typed), true
	case uint64:
		return float64(typed), true
	case uint32:
		return float64(typed), true
	default:
		return 0, false
	}
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
