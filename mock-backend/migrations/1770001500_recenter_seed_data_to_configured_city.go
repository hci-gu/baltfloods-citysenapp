package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		city := currentSeedCity()

		if err := relocateSeededStormObservations(app, city); err != nil {
			return err
		}
		if err := relocateSeededWaterbagObservations(app, city); err != nil {
			return err
		}
		return relocateSeededOverflowObservations(app, city)
	}, func(app core.App) error {
		return nil
	})
}
