package api

import (
	"bufio"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"kubestronaut-sim/hub/internal/auth"
	"kubestronaut-sim/hub/internal/session"
)

const podTemplate = `{"kind":"Pod","metadata":{},"spec":{"containers":[{"name":"facilitator","env":[{"name":"BANK","value":"x"}]}]}}`

// hosted builds a hub with seats in front of a stand-in facilitator.
func hosted(t *testing.T, seats int, upstream http.Handler) (*Server, *session.Manager) {
	t.Helper()
	s, _ := newServer(t, auth.ModeGitHub)

	host := "127.0.0.1"
	if upstream != nil {
		srv := httptest.NewServer(upstream)
		t.Cleanup(srv.Close)
		u, err := url.Parse(srv.URL)
		if err != nil {
			t.Fatal(err)
		}
		host = u.Hostname()
		s.Sessions = session.New(&session.Static{Host: host}, session.Config{
			Flavours: map[session.Kind]session.Flavour{
				session.Practical: {Seats: seats, Template: session.Template(podTemplate), Bank: "ckad-mock-01"},
			},
			Port: atoi(u.Port()),
			Logf: func(string, ...any) {},
		})
	} else {
		s.Sessions = session.New(&session.Static{Host: host}, session.Config{
			Flavours: map[session.Kind]session.Flavour{
				session.Practical: {Seats: seats, Template: session.Template(podTemplate)},
			},
			Logf: func(string, ...any) {},
		})
	}
	s.DefaultKind = session.Practical
	return s, s.Sessions
}

func atoi(s string) int {
	n := 0
	for _, r := range s {
		n = n*10 + int(r-'0')
	}
	return n
}

// ready polls start the way the SPA does, until the seat's Pod answers,
// sending the same body every time — which is what the browser does, and
// what makes the "did my options survive admission" assertion meaningful
// on the request that finally lands.
func ready(t *testing.T, s *Server, c *http.Cookie, body string) *httptest.ResponseRecorder {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		r := httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(body))
		r.AddCookie(c)
		w := do(s, r)
		if w.Code != http.StatusAccepted {
			return w
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("the session never became ready")
	return nil
}

// Admission and the attempt are separate events minutes apart. The first
// answer is "yours is starting"; only once the Pod answers does the
// facilitator's own start run.
func TestStartAdmitsThenForwardsToTheFacilitator(t *testing.T) {
	var forwarded string
	s, _ := hosted(t, 1, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		forwarded = r.Method + " " + r.URL.Path + " " + string(body)
		w.Write([]byte(`{"state":"running"}`))
	}))
	c := login(t, s, "583231", "octocat")

	first := httptest.NewRequest(http.MethodPost, "/api/session/start", strings.NewReader(`{"mode":"exam"}`))
	first.AddCookie(c)
	if w := do(s, first); w.Code != http.StatusAccepted {
		t.Fatalf("first start = %d, want 202 while the pod boots", w.Code)
	}

	w := ready(t, s, c, `{"mode":"exam"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("start = %d, body %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Body.String(), "running") {
		t.Errorf("the facilitator's answer did not reach the browser: %s", w.Body)
	}
	// The body has to survive admission: a start whose options were
	// eaten by the hub begins the wrong kind of attempt.
	if !strings.Contains(forwarded, `{"mode":"exam"}`) {
		t.Errorf("forwarded %q, want the original body", forwarded)
	}
}

func TestStartQueuesWhenEverySeatIsTaken(t *testing.T) {
	s, _ := hosted(t, 1, nil)
	first := login(t, s, "583231", "octocat")
	r := httptest.NewRequest(http.MethodPost, "/api/session/start", nil)
	r.AddCookie(first)
	do(s, r)

	second := httptest.NewRequest(http.MethodPost, "/api/session/start", nil)
	second.AddCookie(login(t, s, "999999", "someone"))
	w := do(s, second)
	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", w.Code)
	}
	var body struct {
		Queued   bool `json:"queued"`
		Position int  `json:"position"`
		Seats    int  `json:"seats"`
	}
	json.Unmarshal(w.Body.Bytes(), &body)
	if !body.Queued || body.Position != 1 || body.Seats != 1 {
		t.Errorf("body = %+v, want a usable queue position", body)
	}
}

// The catch-all. Everything the hub does not answer is the candidate's
// own Pod, and it must not be reachable without a session.
func TestProxyRequiresBothALoginAndASession(t *testing.T) {
	s, _ := hosted(t, 1, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("upstream"))
	}))

	if w := do(s, httptest.NewRequest(http.MethodGet, "/api/exam", nil)); w.Code != http.StatusUnauthorized {
		t.Errorf("logged out = %d, want 401", w.Code)
	}

	r := httptest.NewRequest(http.MethodGet, "/api/exam", nil)
	r.AddCookie(login(t, s, "583231", "octocat"))
	if w := do(s, r); w.Code != http.StatusNotFound {
		t.Errorf("no session = %d, want 404", w.Code)
	}
}

func TestProxyReachesTheSessionPodOnceItIsReady(t *testing.T) {
	s, _ := hosted(t, 1, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("questions for " + r.URL.Path))
	}))
	c := login(t, s, "583231", "octocat")
	ready(t, s, c, "{}")

	r := httptest.NewRequest(http.MethodGet, "/api/exam", nil)
	r.AddCookie(c)
	w := do(s, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "/api/exam") {
		t.Errorf("status %d body %q", w.Code, w.Body)
	}
}

// The desktop is a WebSocket, and it is the single most fragile thing to
// put behind a proxy: a 101 that is not hijacked and spliced leaves the
// candidate looking at a blank screen with no error anywhere.
//
// httptest.NewRecorder cannot hijack, so this runs the hub over a real
// listener and speaks the handshake by hand.
func TestTheDesktopWebSocketUpgradeSurvivesTheProxy(t *testing.T) {
	upstream := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/desktop/websockify" {
			return // the admission poll, which shares this upstream
		}
		if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			t.Errorf("upgrade header did not reach the pod: %v", r.Header)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		conn, buf, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		buf.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
		buf.Flush()
		// Echo one frame's worth of bytes, which is what proves the
		// connection is spliced rather than merely opened.
		line, _ := buf.ReadString('\n')
		buf.WriteString("echo:" + line)
		buf.Flush()
	})
	s, _ := hosted(t, 1, upstream)
	c := login(t, s, "583231", "octocat")
	ready(t, s, c, "{}")

	hub := httptest.NewServer(s.Handler())
	defer hub.Close()

	conn, err := net.Dial("tcp", strings.TrimPrefix(hub.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	req, _ := http.NewRequest(http.MethodGet, hub.URL+"/desktop/websockify", nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.AddCookie(c)
	if err := req.Write(conn); err != nil {
		t.Fatal(err)
	}

	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("status = %d, want 101", resp.StatusCode)
	}
	if _, err := conn.Write([]byte("hello\n")); err != nil {
		t.Fatal(err)
	}
	got, err := br.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	if got != "echo:hello\n" {
		t.Errorf("read %q, want the upstream's echo — the connection is not spliced", got)
	}
}

// A reset in hosted mode replaces the Pod, and says so in the
// conductor's shape so ControlProgress renders it unchanged.
func TestResetReturnsAJobInTheConductorsShape(t *testing.T) {
	s, _ := hosted(t, 1, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	c := login(t, s, "583231", "octocat")
	ready(t, s, c, "{}")

	r := httptest.NewRequest(http.MethodPost, "/api/control/reset", nil)
	r.AddCookie(c)
	w := do(s, r)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202; body %s", w.Code, w.Body)
	}
	var body struct {
		Job session.Job `json:"job"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Job.ID == "" || body.Job.Op != "reset" || len(body.Job.Phases) == 0 {
		t.Errorf("job = %+v", body.Job)
	}
	if body.Job.Phases[0].State != session.PhasePending && body.Job.Phases[0].State != session.PhaseRunning {
		t.Errorf("first phase = %q", body.Job.Phases[0].State)
	}
}

// The SPA polls control status on load to decide whether an operation is
// in flight. "You have no session" is a true answer to that, and a 404
// would read to the UI as a broken control plane.
func TestControlStatusAnswersBeforeAnySessionExists(t *testing.T) {
	s, _ := hosted(t, 1, nil)
	r := httptest.NewRequest(http.MethodGet, "/api/control/status", nil)
	r.AddCookie(login(t, s, "583231", "octocat"))
	w := do(s, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var snap session.Snapshot
	json.Unmarshal(w.Body.Bytes(), &snap)
	if snap.Busy {
		t.Error("busy with no session")
	}
}

// Every /api/history route is the hub's. One left to the catch-all would
// answer from the Pod's own /state volume — the copy that is about to be
// destroyed — so "clear my history" would clear nothing that lasts.
func TestHistoryRoutesNeverReachThePod(t *testing.T) {
	var reached []string
	s, _ := hosted(t, 1, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = append(reached, r.URL.Path)
	}))
	c := login(t, s, "583231", "octocat")
	ready(t, s, c, "{}")

	for _, tc := range []struct {
		method, path string
		want         int
	}{
		{http.MethodGet, "/api/history", http.StatusOK},
		{http.MethodDelete, "/api/history", http.StatusNoContent},
		{http.MethodGet, "/api/history/export", http.StatusOK},
		{http.MethodPost, "/api/history/import", http.StatusNotImplemented},
		{http.MethodGet, "/api/history/summary", http.StatusNotImplemented},
	} {
		r := httptest.NewRequest(tc.method, tc.path, nil)
		r.AddCookie(c)
		if w := do(s, r); w.Code != tc.want {
			t.Errorf("%s %s = %d, want %d", tc.method, tc.path, w.Code, tc.want)
		}
	}
	for _, p := range reached {
		if strings.HasPrefix(p, "/api/history") {
			t.Errorf("%s was proxied to the pod", p)
		}
	}
}

func TestClearingHistoryReallyRemovesIt(t *testing.T) {
	s, st := newServer(t, auth.ModeGitHub)
	if _, err := st.Add("583231", json.RawMessage(`{"id":"a1","gradedAt":"2026-08-03T10:00:00Z"}`), nil); err != nil {
		t.Fatal(err)
	}
	c := login(t, s, "583231", "octocat")

	del := httptest.NewRequest(http.MethodDelete, "/api/history", nil)
	del.AddCookie(c)
	if w := do(s, del); w.Code != http.StatusNoContent {
		t.Fatalf("delete = %d", w.Code)
	}
	get := httptest.NewRequest(http.MethodGet, "/api/history", nil)
	get.AddCookie(c)
	if body := do(s, get).Body.String(); strings.Contains(body, "a1") {
		t.Errorf("the attempt survived: %s", body)
	}
}

// The header chip and the queue dialog render from /api/me, so it has to
// carry seat state — and the counts are visible logged out, because
// someone deciding whether to sign in is entitled to know whether there
// is anywhere to sit.
func TestMeCarriesSeatAndSessionState(t *testing.T) {
	s, _ := hosted(t, 2, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))

	var out me
	json.Unmarshal(do(s, httptest.NewRequest(http.MethodGet, "/api/me", nil)).Body.Bytes(), &out)
	if out.Seats["practical"].Total != 2 || out.Seats["practical"].Used != 0 {
		t.Errorf("logged-out seats = %+v", out.Seats)
	}

	c := login(t, s, "583231", "octocat")
	ready(t, s, c, "{}")
	r := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	r.AddCookie(c)
	out = me{}
	json.Unmarshal(do(s, r).Body.Bytes(), &out)
	if out.Session == nil || out.Session.State != session.Ready {
		t.Fatalf("session = %+v", out.Session)
	}
	if out.Seats["practical"].Used != 1 {
		t.Errorf("used seats = %d, want 1", out.Seats["practical"].Used)
	}
	// The Pod's address is the candidate's own, but publishing an
	// in-cluster address in a JSON response tells every user something
	// about the infrastructure they have no use for.
	if strings.Contains(do(s, r).Body.String(), "127.0.0.1:") {
		t.Error("/api/me leaked the pod address")
	}
}

func TestEndingASessionFreesTheSeat(t *testing.T) {
	s, m := hosted(t, 1, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	c := login(t, s, "583231", "octocat")
	ready(t, s, c, "{}")

	end := httptest.NewRequest(http.MethodPost, "/hub/session/end", nil)
	end.AddCookie(c)
	if w := do(s, end); w.Code != http.StatusNoContent {
		t.Fatalf("end = %d", w.Code)
	}
	if used := m.Seats()[session.Practical][0]; used != 0 {
		t.Errorf("%d seats still used after ending", used)
	}
	if _, err := m.Get("583231"); err == nil {
		t.Error("the session outlived the request to end it")
	}
}
