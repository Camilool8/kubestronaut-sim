package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"kubestronaut-sim/conductor/internal/control"
	"kubestronaut-sim/conductor/internal/job"
)

type Ops interface {
	StartReset() (job.Job, error)
	StartSwitch(bank string) (job.Job, error)

	Banks() any

	Reseed(ctx context.Context, qid string) error

	StartSeed(questions []string) (job.Job, error)
}

func New(ops Ops, store *job.Store) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("GET /api/control/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, store.Status())
	})

	mux.HandleFunc("GET /api/control/log", func(w http.ResponseWriter, r *http.Request) {
		jobID, lines := store.Log()
		if lines == nil {
			lines = []string{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"jobId": jobID, "lines": lines})
	})

	mux.HandleFunc("POST /api/control/reset", func(w http.ResponseWriter, r *http.Request) {
		j, err := ops.StartReset()
		if err != nil {
			writeOpError(w, err)
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{"job": j})
	})

	mux.HandleFunc("POST /api/control/reseed", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Question string `json:"question"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Question == "" {
			writeError(w, http.StatusBadRequest, "body must be JSON with a non-empty \"question\"")
			return
		}
		if err := ops.Reseed(r.Context(), body.Question); err != nil {
			writeOpError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	mux.HandleFunc("POST /api/control/seed", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Questions []string `json:"questions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "body must be JSON with a non-empty \"questions\" array")
			return
		}
		j, err := ops.StartSeed(body.Questions)
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

func writeOpError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, job.ErrBusy):
		writeError(w, http.StatusConflict, "another control operation is in flight")
	case errors.Is(err, control.ErrSessionRunning):
		writeError(w, http.StatusConflict, "a session is running — end the exam first")
	case errors.Is(err, control.ErrInvalidBank):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, control.ErrRestartUnavailable):

		writeError(w, http.StatusNotImplemented, err.Error())
	case errors.Is(err, control.ErrUnknownQuestion):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, control.ErrReseedBusy):
		writeError(w, http.StatusConflict, "a re-seed is already running")
	case errors.Is(err, control.ErrNotTraining):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, control.ErrNoReseed):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, control.ErrNoSeed):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, control.ErrNoSeedTargets):
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
