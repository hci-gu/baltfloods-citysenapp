package main

import (
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"

	_ "app/migrations"
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
			records, err := fetchRecords(se.App, "streetai_storm_water", e.Request.PathValue("jurisdictionId"))
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
			records, err := fetchRecords(se.App, "streetai_waterbag_testkit", e.Request.PathValue("jurisdictionId"))
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
			records, err := fetchRecords(se.App, "streetai_waterbag_testkit", "")
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
		items = append(items, map[string]any{
			"name":                   record.GetRaw("name"),
			"latitude":               record.GetRaw("latitude"),
			"longitude":              record.GetRaw("longitude"),
			"dataRetrievedTimestamp": record.GetRaw("dataRetrievedTimestamp"),
			"waterLevel":             record.GetRaw("waterLevel"),
			"waterTemperature":       record.GetRaw("waterTemperature"),
			"electricalConductivity": record.GetRaw("electricalConductivity"),
			"turbidity":              record.GetRaw("turbidity"),
			"flowRate":               record.GetRaw("flowRate"),
			"fillLevel": map[string]any{
				"value":  record.GetRaw("fillLevel_value"),
				"result": record.GetRaw("fillLevel_result"),
			},
			"waterQuality": normalizeStormWaterQuality(record.GetRaw("waterQuality")),
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
		if record.GetString("observationType") != "" {
			continue
		}
		if record.GetRaw("coords_latitudeValue") == nil || record.GetRaw("coords_longitudeValue") == nil {
			continue
		}

		items = append(items, map[string]any{
			"id": record.Id,
			"coords": map[string]any{
				"latitudeValue":  record.GetRaw("coords_latitudeValue"),
				"longitudeValue": record.GetRaw("coords_longitudeValue"),
			},
			"dataRetrievedTimestamp": record.GetRaw("dataRetrievedTimestamp"),
			"imageUrl":               record.GetRaw("imageUrl"),
			"airTemp": map[string]any{
				"value":                  record.GetRaw("airTemp_value"),
				"dataRetrievedTimestamp": record.GetRaw("airTemp_dataRetrievedTimestamp"),
			},
			"waterTemp": map[string]any{
				"value":                  record.GetRaw("waterTemp_value"),
				"dataRetrievedTimestamp": record.GetRaw("waterTemp_dataRetrievedTimestamp"),
			},
			"visibility": map[string]any{
				"value":                  record.GetRaw("visibility_value"),
				"dataRetrievedTimestamp": record.GetRaw("visibility_dataRetrievedTimestamp"),
			},
			"algae": map[string]any{
				"value":                  record.GetRaw("algae_value"),
				"dataRetrievedTimestamp": record.GetRaw("algae_dataRetrievedTimestamp"),
			},
			"waterPh": map[string]any{
				"value":                  record.GetRaw("waterPh_value"),
				"dataRetrievedTimestamp": record.GetRaw("waterPh_dataRetrievedTimestamp"),
				"result":                 record.GetRaw("waterPh_result"),
			},
			"turbidity": map[string]any{
				"value":                  record.GetRaw("turbidity_value"),
				"dataRetrievedTimestamp": record.GetRaw("turbidity_dataRetrievedTimestamp"),
				"result":                 record.GetRaw("turbidity_result"),
			},
			"nitrate": map[string]any{
				"value":                  record.GetRaw("nitrate_value"),
				"dataRetrievedTimestamp": record.GetRaw("nitrate_dataRetrievedTimestamp"),
				"result":                 record.GetRaw("nitrate_result"),
			},
			"phosphate": map[string]any{
				"value":                  record.GetRaw("phosphate_value"),
				"dataRetrievedTimestamp": record.GetRaw("phosphate_dataRetrievedTimestamp"),
				"result":                 record.GetRaw("phosphate_result"),
			},
			"dissolvedOxygen": map[string]any{
				"value":                  record.GetRaw("dissolvedOxygen_value"),
				"dataRetrievedTimestamp": record.GetRaw("dissolvedOxygen_dataRetrievedTimestamp"),
				"result":                 record.GetRaw("dissolvedOxygen_result"),
				"calculatedValue":        record.GetRaw("dissolvedOxygen_calculatedValue"),
			},
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

	collection, err := app.FindCollectionByNameOrId("streetai_waterbag_testkit")
	if err != nil {
		return nil, apis.NewApiError(500, "Missing streetai_waterbag_testkit collection.", err)
	}

	record := core.NewRecord(collection)

	if err := setRequiredNumber(record, "coords_latitudeValue", e.Request.FormValue("latitude")); err != nil {
		return nil, err
	}
	if err := setRequiredNumber(record, "coords_longitudeValue", e.Request.FormValue("longitude")); err != nil {
		return nil, err
	}

	observationType := e.Request.FormValue("observationType")
	if observationType == "" {
		return nil, apis.NewApiError(400, "Missing observation type.", nil)
	}
	if observationType != "water_system" && observationType != "stormwater" {
		return nil, apis.NewApiError(400, "Invalid observation type.", nil)
	}
	record.Set("observationType", observationType)

	if value := e.Request.FormValue("identificationCode"); value != "" {
		record.Set("identificationCode", value)
	} else {
		return nil, apis.NewApiError(400, "Missing identification code.", nil)
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
	record.Set("termsAccepted", termsAccepted)
	record.Set("cc0Accepted", cc0Accepted)

	timestamp := time.Now().Unix()
	record.Set("dataRetrievedTimestamp", float64(timestamp))

	setOptionalMetric(record, "airTemp_value", "airTemp_dataRetrievedTimestamp", e.Request.FormValue("airTemp"), timestamp)
	setOptionalMetric(record, "waterTemp_value", "waterTemp_dataRetrievedTimestamp", e.Request.FormValue("waterTemp"), timestamp)
	setOptionalMetric(record, "visibility_value", "visibility_dataRetrievedTimestamp", e.Request.FormValue("depthOfView"), timestamp)
	setOptionalMetric(record, "waterPh_value", "waterPh_dataRetrievedTimestamp", e.Request.FormValue("waterPh"), timestamp)
	setOptionalMetric(record, "turbidity_value", "turbidity_dataRetrievedTimestamp", e.Request.FormValue("turbidity"), timestamp)
	setOptionalMetric(record, "dissolvedOxygen_value", "dissolvedOxygen_dataRetrievedTimestamp", e.Request.FormValue("dissolvedOxygen"), timestamp)
	setOptionalMetric(record, "nitrate_value", "nitrate_dataRetrievedTimestamp", e.Request.FormValue("nitrate"), timestamp)
	setOptionalMetric(record, "phosphate_value", "phosphate_dataRetrievedTimestamp", e.Request.FormValue("phosphate"), timestamp)

	if value := e.Request.FormValue("algaeLevel"); value != "" {
		if mapped, ok := algaeLevelToValue(value); ok {
			record.Set("algae_value", mapped)
			record.Set("algae_dataRetrievedTimestamp", float64(timestamp))
		}
	}

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

	if err := app.Save(record); err != nil {
		return nil, apis.NewApiError(500, "Failed to store observation.", err)
	}

	return record, nil
}

func mapWaterObservations(records []*core.Record) []map[string]any {
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		if record.GetString("observationType") == "" {
			continue
		}

		latitude := record.GetRaw("coords_latitudeValue")
		if latitude == nil {
			latitude = record.GetRaw("latitude")
		}
		longitude := record.GetRaw("coords_longitudeValue")
		if longitude == nil {
			longitude = record.GetRaw("longitude")
		}

		airTemp := record.GetRaw("airTemp_value")
		if airTemp == nil {
			airTemp = record.GetRaw("airTemp")
		}
		waterTemp := record.GetRaw("waterTemp_value")
		if waterTemp == nil {
			waterTemp = record.GetRaw("waterTemp")
		}
		depthOfView := record.GetRaw("visibility_value")
		if depthOfView == nil {
			depthOfView = record.GetRaw("depthOfView")
		}
		waterPh := record.GetRaw("waterPh_value")
		if waterPh == nil {
			waterPh = record.GetRaw("waterPh")
		}
		turbidity := record.GetRaw("turbidity_value")
		if turbidity == nil {
			turbidity = record.GetRaw("turbidity")
		}
		dissolvedOxygen := record.GetRaw("dissolvedOxygen_value")
		if dissolvedOxygen == nil {
			dissolvedOxygen = record.GetRaw("dissolvedOxygen")
		}
		nitrate := record.GetRaw("nitrate_value")
		if nitrate == nil {
			nitrate = record.GetRaw("nitrate")
		}
		phosphate := record.GetRaw("phosphate_value")
		if phosphate == nil {
			phosphate = record.GetRaw("phosphate")
		}

		photo := ""
		if value := record.Get("photo"); value != nil {
			switch typed := value.(type) {
			case []string:
				if len(typed) > 0 {
					photo = typed[0]
				}
			case string:
				photo = typed
			}
		}

		imageUrl := ""
		if photo != "" {
			imageUrl = "../api/files/streetai_waterbag_testkit/" + record.Id + "/" + photo
		} else if value, ok := record.GetRaw("imageUrl").(string); ok {
			imageUrl = value
		}

		algaeLevel := record.GetRaw("algaeLevel")
		if algaeLevel == nil {
			algaeLevel = mapAlgaeValueToLevel(record.GetRaw("algae_value"))
		} else if value, ok := algaeLevel.(string); ok && value == "" {
			algaeLevel = mapAlgaeValueToLevel(record.GetRaw("algae_value"))
		}

		items = append(items, map[string]any{
			"id":                     record.Id,
			"latitude":               latitude,
			"longitude":              longitude,
			"dataRetrievedTimestamp": resolveObservationTimestamp(record),
			"imageUrl":               imageUrl,
			"observationType":        record.GetRaw("observationType"),
			"airTemp":                airTemp,
			"waterTemp":              waterTemp,
			"depthOfView":            depthOfView,
			"algaeLevel":             algaeLevel,
			"waterPh":                waterPh,
			"turbidity":              turbidity,
			"dissolvedOxygen":        dissolvedOxygen,
			"nitrate":                nitrate,
			"phosphate":              phosphate,
		})
	}
	return items
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

func setOptionalMetric(
	record *core.Record,
	valueField string,
	timestampField string,
	raw string,
	timestamp int64,
) {
	if raw == "" {
		return
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return
	}
	record.Set(valueField, value)
	record.Set(timestampField, float64(timestamp))
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
