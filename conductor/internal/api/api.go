// Package api exposes the conductor's control endpoints. Only the
// facilitator can reach them (the conductor lives alone with it on the
// internal control network), and the facilitator re-exposes them to the
// browser under the same single :8080 origin as everything else.
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"kubestronaut-sim/conductor/internal/control"
	"kubestronaut-sim/conductor/internal/job"
)

// Ops is the slice of the controller the HTTP layer invokes.
type Ops interface {
	StartReset() (job.Job, error)
	StartSwitch(bank string) (job.Job, error)
	// Banks returns the catalog response body: {active, banks:[...]}.
	Banks() any
}

// New returns the conductor's HTTP handler.
func New(ops Ops, store *job.Store) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("GET /api/control/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, store.Status())
	})

	mux.HandleFunc("POST /api/control/reset", func(w http.ResponseWriter, r *http.Request) {
		j, err := ops.StartReset()
		if err != nil {
			writeOpError(w, err)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"job": j})
	})

	mux.HandleFunc("GET /api/control/banks", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, ops.Banks())
	})

	mux.HandleFunc("POST /api/control/switch", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Bank string `json:"bank"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Bank == "" {
			writeError(w, http.StatusBadRequest, "body must be JSON with a non-empty \"bank\"")
			return
		}
		j, err := ops.StartSwitch(body.Bank)
		if err != nil {
			writeOpError(w, err)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"job": j})
	})

	return mux
}

// writeOpError maps controller sentinels onto HTTP statuses.
func writeOpError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, job.ErrBusy):
		writeError(w, http.StatusConflict, "another control operation is in flight")
	case errors.Is(err, control.ErrSessionRunning):
		writeError(w, http.StatusConflict, "a session is running — end the exam first")
	case errors.Is(err, control.ErrInvalidBank):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
