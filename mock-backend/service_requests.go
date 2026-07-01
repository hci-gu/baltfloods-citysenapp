package main

import (
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	"github.com/pocketbase/pocketbase/tools/router"
)

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
