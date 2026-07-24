// Package api exposes the conductor's control endpoints. Only the
// facilitator can reach them (the conductor lives alone with it on the
// internal control network), and the facilitator re-exposes them to the
// browser under the same single :8080 origin as everything else.
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"kubestronaut-sim/conductor/internal/job"
)

// Ops is the slice of the controller the HTTP layer invokes.
type Ops interface {
	StartReset() (job.Job, error)
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
			if errors.Is(err, job.ErrBusy) {
				writeError(w, http.StatusConflict, "another control operation is in flight")
				return
			}
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"job": j})
	})

	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
