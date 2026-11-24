package api_test

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
	"kubestronaut-sim/facilitator/internal/session"
)

const (
	seedRunningStatus = `{"busy":true,"job":{"id":"job-1","op":"seed"}}`
	seedDoneStatus    = `{"busy":false,"lastJob":{"id":"job-1","op":"seed"}}`
)

func (c *conductorStub) setStatus(body string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.status = body
}

func readPrepFile(t *testing.T, sessionPath string) (session.Prep, bool) {
	t.Helper()
	raw, err := os.ReadFile(session.PrepPath(sessionPath))
	if errors.Is(err, fs.ErrNotExist) {
		return session.Prep{}, false
	}
	if err != nil {
		t.Fatalf("read prep file: %v", err)
	}
	var p session.Prep
	if err := json.Unmarshal(raw, &p); err != nil {
		t.Fatalf("prep file is not JSON: %v (%s)", err, raw)
	}
	return p, true
}

func waitPrepFileGone(t *testing.T, sessionPath, what string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if _, ok := readPrepFile(t, sessionPath); !ok {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("the prep file outlived %s", what)
}

func TestRestartWhilePreparingResumesWatchingTheSeed(t *testing.T) {
	for _, tc := range []struct {
		name      string
		body      string
		wantState string
	}{
		{"awaitStart reaches ready", awaitBody, "idle"},
		{"no flag starts by itself", `{"mode":"exam"}`, "running"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sessionPath := t.TempDir() + "/session.json"
			conductor := &conductorStub{status: seedRunningStatus}
			ts, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, sessionPath)

			if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", tc.body); rec.Code != http.StatusAccepted {
				t.Fatalf("start: status = %d, want 202", rec.Code)
			}
			if saved, ok := readPrepFile(t, sessionPath); !ok || saved.Ready {
				t.Fatalf("prep file = %+v (exists=%v), want a not-yet-ready record", saved, ok)
			}

			again := newFakeSeeder()
			restarted, _ := newHandsOnPoolServer(t, again, conductor, sessionPath)
			got := restarted.session(t)
			if got.State != "idle" || got.Preparing == nil || got.Preparing.Ready || got.Preparing.JobID != "job-1" {
				t.Fatalf("state=%q preparing=%+v, want job-1 still preparing", got.State, got.Preparing)
			}
			if rec := restarted.doJSON(t, http.MethodPost, "/api/session/begin", ""); rec.Code != http.StatusConflict {
				t.Fatalf("begin while resuming: status = %d, want 409", rec.Code)
			}

			conductor.setStatus(seedDoneStatus)
			again.set(api.SeedDone, "")
			switch tc.wantState {
			case "running":
				got = restarted.waitSettled(t)
				if got.State != "running" || got.PrepareError != "" {
					t.Fatalf("state=%q prepareError=%q, want the ungated attempt running", got.State, got.PrepareError)
				}
				waitPrepFileGone(t, sessionPath, "a resumed auto-start")
			default:
				got = restarted.waitFor(t, "the resumed preparation to become ready", func(s sessionBody) bool {
					return s.Preparing != nil && s.Preparing.Ready
				})
				if got.State != "idle" {
					t.Fatalf("state = %q, want idle until the candidate begins", got.State)
				}
				if saved, ok := readPrepFile(t, sessionPath); !ok || !saved.Ready {
					t.Errorf("prep file = %+v (exists=%v), want it saved as ready", saved, ok)
				}
			}
			if n := again.starts(); n != 0 {
				t.Errorf("the restarted service seeded %d time(s), want 0", n)
			}
		})
	}
}

func TestSeedThatFinishedWhileDownHonoursTheGate(t *testing.T) {
	for _, tc := range []struct {
		name      string
		body      string
		wantState string
	}{
		{"awaitStart waits", awaitBody, "idle"},
		{"no flag starts", `{"mode":"exam"}`, "running"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sessionPath := t.TempDir() + "/session.json"
			conductor := &conductorStub{status: seedRunningStatus}
			ts, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, sessionPath)
			if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", tc.body); rec.Code != http.StatusAccepted {
				t.Fatalf("start: status = %d, want 202", rec.Code)
			}

			conductor.setStatus(seedDoneStatus)
			restarted, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, sessionPath)

			if tc.wantState == "running" {
				got := restarted.waitSettled(t)
				if got.State != "running" || got.RemainingSeconds != 3600 {
					t.Fatalf("state=%q remaining=%d, want running with the whole 3600s", got.State, got.RemainingSeconds)
				}
				waitPrepFileGone(t, sessionPath, "an auto-start on resume")
				return
			}
			got := restarted.waitFor(t, "the gated attempt to be ready", func(s sessionBody) bool {
				return s.Preparing != nil && s.Preparing.Ready
			})
			if got.State != "idle" || got.Preparing.ReadyAt == "" {
				t.Fatalf("state=%q preparing=%+v, want idle and ready", got.State, got.Preparing)
			}
			time.Sleep(50 * time.Millisecond)
			if still := restarted.session(t); still.State != "idle" {
				t.Fatalf("state = %q, want idle: the gate outlives a restart", still.State)
			}
		})
	}
}

func TestRestartDiscardsAPreparationTheConductorDisowns(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status string
	}{
		{"cluster reset meanwhile", `{"busy":false,"lastJob":{"id":"job-2","op":"reset"}}`},
		{"another job running", `{"busy":true,"job":{"id":"job-2","op":"reset"},"lastJob":{"id":"job-1","op":"seed"}}`},
		{"conductor forgot every job", `{"busy":false}`},
		{"same id, different operation", `{"busy":false,"lastJob":{"id":"job-1","op":"switch"}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sessionPath := t.TempDir() + "/session.json"
			conductor := &conductorStub{status: seedDoneStatus}
			seeder := newFakeSeeder()
			ts, _ := newHandsOnPoolServer(t, seeder, conductor, sessionPath)
			prepareReady(t, ts, seeder)

			conductor.setStatus(tc.status)
			restarted, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, sessionPath)
			got := restarted.waitFor(t, "the lost attempt to be reported", func(s sessionBody) bool {
				return s.PrepareError != ""
			})
			if got.State != "idle" || got.Preparing != nil {
				t.Errorf("state=%q preparing=%+v, want idle with nothing to resume", got.State, got.Preparing)
			}
			if !strings.Contains(got.PrepareError, "restarted") {
				t.Errorf("prepareError = %q, want it to say what happened", got.PrepareError)
			}
			waitPrepFileGone(t, sessionPath, "a discarded preparation")
			if rec := restarted.doJSON(t, http.MethodPost, "/api/session/begin", ""); rec.Code != http.StatusConflict {
				t.Fatalf("begin: status = %d, want 409", rec.Code)
			}
			if rec := restarted.doJSON(t, http.MethodPost, "/api/session/start", awaitBody); rec.Code != http.StatusConflict {
				t.Fatalf("start: status = %d, want 409 until the environment is reset", rec.Code)
			}
		})
	}
}

func TestRestartReportsASeedThatFailedWhileDown(t *testing.T) {
	sessionPath := t.TempDir() + "/session.json"
	conductor := &conductorStub{status: seedRunningStatus}
	ts, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, sessionPath)
	if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody); rec.Code != http.StatusAccepted {
		t.Fatalf("start: status = %d, want 202", rec.Code)
	}

	conductor.setStatus(`{"busy":false,"lastJob":{"id":"job-1","op":"seed","error":"seeding q02 failed (exit 1)"}}`)
	restarted, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, sessionPath)
	got := restarted.waitSettled(t)
	if got.State != "idle" || got.PrepareError != "seeding q02 failed (exit 1)" {
		t.Fatalf("state=%q prepareError=%q, want idle with the conductor's message", got.State, got.PrepareError)
	}
	waitPrepFileGone(t, sessionPath, "a failed seed")
}

func TestPrepFileFollowsThePreparation(t *testing.T) {
	t.Run("begin", func(t *testing.T) {
		sessionPath := t.TempDir() + "/session.json"
		seeder := newFakeSeeder()
		ts, _ := newHandsOnPoolServer(t, seeder, fakeControl, sessionPath)
		prepareReady(t, ts, seeder)
		if rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", ""); rec.Code != http.StatusOK {
			t.Fatalf("begin: status = %d", rec.Code)
		}
		waitPrepFileGone(t, sessionPath, "begin")
	})
	t.Run("cancel", func(t *testing.T) {
		sessionPath := t.TempDir() + "/session.json"
		seeder := newFakeSeeder()
		ts, _ := newHandsOnPoolServer(t, seeder, fakeControl, sessionPath)
		prepareReady(t, ts, seeder)
		if rec := ts.do(t, http.MethodDelete, "/api/session"); rec.Code != http.StatusNoContent {
			t.Fatalf("DELETE: status = %d", rec.Code)
		}
		waitPrepFileGone(t, sessionPath, "DELETE /api/session")
	})
	t.Run("reset", func(t *testing.T) {
		sessionPath := t.TempDir() + "/session.json"
		seeder := newFakeSeeder()
		ts, _ := newHandsOnPoolServer(t, seeder, fakeControl, sessionPath)
		prepareReady(t, ts, seeder)
		if rec := ts.do(t, http.MethodPost, "/api/control/reset"); rec.Code != http.StatusAccepted {
			t.Fatalf("reset: status = %d", rec.Code)
		}
		waitPrepFileGone(t, sessionPath, "a cluster reset")
	})
	t.Run("switch", func(t *testing.T) {
		sessionPath := t.TempDir() + "/session.json"
		seeder := newFakeSeeder()
		ts, _ := newHandsOnPoolServer(t, seeder, fakeControl, sessionPath)
		if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody); rec.Code != http.StatusAccepted {
			t.Fatalf("start: status = %d", rec.Code)
		}
		if _, ok := readPrepFile(t, sessionPath); !ok {
			t.Fatal("no prep file while preparing")
		}
		if rec := ts.do(t, http.MethodPost, "/api/control/switch"); rec.Code != http.StatusAccepted {
			t.Fatalf("switch: status = %d", rec.Code)
		}
		waitPrepFileGone(t, sessionPath, "a bank switch")
	})
	t.Run("refused reset keeps it", func(t *testing.T) {
		sessionPath := t.TempDir() + "/session.json"
		seeder := newFakeSeeder()
		busy := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { writeConflict(w) })
		ts, _ := newHandsOnPoolServer(t, seeder, busy, sessionPath)
		prepareReady(t, ts, seeder)
		if rec := ts.do(t, http.MethodPost, "/api/control/reset"); rec.Code != http.StatusConflict {
			t.Fatalf("reset: status = %d", rec.Code)
		}
		if saved, ok := readPrepFile(t, sessionPath); !ok || !saved.Ready {
			t.Fatalf("prep file = %+v (exists=%v), want it kept: the cluster was not touched", saved, ok)
		}
	})
	t.Run("failure", func(t *testing.T) {
		sessionPath := t.TempDir() + "/session.json"
		seeder := newFakeSeeder()
		ts, _ := newHandsOnPoolServer(t, seeder, fakeControl, sessionPath)
		if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody); rec.Code != http.StatusAccepted {
			t.Fatalf("start: status = %d", rec.Code)
		}
		seeder.set(api.SeedFailed, "boom")
		ts.waitSettled(t)
		waitPrepFileGone(t, sessionPath, "a failed seed")
	})
	t.Run("auto-start", func(t *testing.T) {
		sessionPath := t.TempDir() + "/session.json"
		seeder := newFakeSeeder()
		ts, _ := newHandsOnPoolServer(t, seeder, fakeControl, sessionPath)
		if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", `{"mode":"exam"}`); rec.Code != http.StatusAccepted {
			t.Fatalf("start: status = %d", rec.Code)
		}
		seeder.set(api.SeedDone, "")
		if got := ts.waitSettled(t); got.State != "running" {
			t.Fatalf("state = %q, want running", got.State)
		}
		waitPrepFileGone(t, sessionPath, "an auto-start")
	})
	t.Run("refused seed writes nothing", func(t *testing.T) {
		sessionPath := t.TempDir() + "/session.json"
		seeder := newFakeSeeder()
		seeder.startErr = errors.New("conductor busy")
		ts, _ := newHandsOnPoolServer(t, seeder, fakeControl, sessionPath)
		if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody); rec.Code != http.StatusConflict {
			t.Fatalf("start: status = %d, want 409", rec.Code)
		}
		if _, ok := readPrepFile(t, sessionPath); ok {
			t.Fatal("a seed the conductor refused left a prep file behind")
		}
	})
}

func TestStalePrepFileLosesToARunningSession(t *testing.T) {
	sessionPath := t.TempDir() + "/session.json"
	conductor := &conductorStub{status: seedDoneStatus}
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolServer(t, seeder, conductor, sessionPath)
	prepareReady(t, ts, seeder)

	stale, err := os.ReadFile(session.PrepPath(sessionPath))
	if err != nil {
		t.Fatalf("read prep file: %v", err)
	}
	rec := ts.doJSON(t, http.MethodPost, "/api/session/begin", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("begin: status = %d", rec.Code)
	}
	startedAt := decodeJSON[begunBody](t, rec).StartedAt
	if err := os.WriteFile(session.PrepPath(sessionPath), stale, 0o644); err != nil {
		t.Fatalf("restore stale prep file: %v", err)
	}

	again := newFakeSeeder()
	restarted, _ := newHandsOnPoolServer(t, again, conductor, sessionPath)
	if _, ok := readPrepFile(t, sessionPath); ok {
		t.Fatal("the stale prep file survived startup next to a running session")
	}
	time.Sleep(50 * time.Millisecond)
	got := restarted.session(t)
	if got.State != "running" || got.Preparing != nil || got.PrepareError != "" {
		t.Fatalf("state=%q preparing=%+v prepareError=%q, want only the running attempt", got.State, got.Preparing, got.PrepareError)
	}
	rec = restarted.doJSON(t, http.MethodPost, "/api/session/begin", "")
	if rec.Code != http.StatusOK || decodeJSON[begunBody](t, rec).StartedAt != startedAt {
		t.Fatalf("begin after restart: status=%d body=%s, want the attempt started at %s", rec.Code, rec.Body.String(), startedAt)
	}
	if n := again.starts(); n != 0 {
		t.Errorf("seeded %d time(s) after restart, want 0", n)
	}
}

func TestCorruptPrepFileIsIgnored(t *testing.T) {
	for _, tc := range []struct {
		name      string
		content   string
		status    string
		wantError bool
	}{
		{"garbage, idle conductor", "{not json", `{"busy":false}`, false},
		{"truncated, idle conductor", "", `{"busy":false}`, false},
		{"wrong version", `{"version":99,"jobId":"job-1","mode":"exam","questionIds":["q01"]}`, `{"busy":false}`, false},
		{"garbage after a seed", "{not json", seedDoneStatus, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			sessionPath := t.TempDir() + "/session.json"
			if err := os.WriteFile(session.PrepPath(sessionPath), []byte(tc.content), 0o644); err != nil {
				t.Fatal(err)
			}
			seeder := newFakeSeeder()
			ts, _ := newHandsOnPoolServer(t, seeder, &conductorStub{status: tc.status}, sessionPath)
			if _, ok := readPrepFileRaw(sessionPath); ok {
				t.Fatal("the unusable prep file was kept")
			}

			if tc.wantError {
				got := ts.waitFor(t, "the probe to report the lost preparation", func(s sessionBody) bool {
					return s.PrepareError != ""
				})
				if got.Preparing != nil || got.State != "idle" {
					t.Errorf("state=%q preparing=%+v, want idle", got.State, got.Preparing)
				}
				return
			}
			time.Sleep(50 * time.Millisecond)
			if got := ts.session(t); got.State != "idle" || got.Preparing != nil || got.PrepareError != "" {
				t.Fatalf("state=%q preparing=%+v prepareError=%q, want a plain idle session", got.State, got.Preparing, got.PrepareError)
			}
			if rec := ts.doJSON(t, http.MethodPost, "/api/session/start", awaitBody); rec.Code != http.StatusAccepted {
				t.Fatalf("start: status = %d, want 202, body=%s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestSavedDrawOutsideTheBankIsLost(t *testing.T) {
	sessionPath := t.TempDir() + "/session.json"
	conductor := &conductorStub{status: seedDoneStatus}
	seeder := newFakeSeeder()
	ts, _ := newHandsOnPoolServer(t, seeder, conductor, sessionPath)
	prepareReady(t, ts, seeder)

	saved, _ := readPrepFile(t, sessionPath)
	saved.QuestionIDs = append(saved.QuestionIDs[:2], "q99-not-in-bank")
	if err := session.SavePrep(session.PrepPath(sessionPath), saved); err != nil {
		t.Fatal(err)
	}

	restarted, _ := newHandsOnPoolServer(t, newFakeSeeder(), conductor, sessionPath)
	got := restarted.session(t)
	if got.Preparing != nil || !strings.Contains(got.PrepareError, "restarted") {
		t.Fatalf("preparing=%+v prepareError=%q, want the saved draw rejected as lost", got.Preparing, got.PrepareError)
	}
	if _, ok := readPrepFile(t, sessionPath); ok {
		t.Error("the rejected prep file was kept")
	}
}

func readPrepFileRaw(sessionPath string) ([]byte, bool) {
	raw, err := os.ReadFile(session.PrepPath(sessionPath))
	return raw, err == nil
}
