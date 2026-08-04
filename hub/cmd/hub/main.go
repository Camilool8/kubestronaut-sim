// Command hub is the front door of the hosted tier: identity, attempt
// history, seats, and the proxy to each candidate's own session Pod.
//
// It exists so the simulator does not have to change. The facilitator
// still has no authentication of any kind — it is simply never reachable
// except through this process. That is what keeps `./sim up`
// byte-identical, with no accounts and no new required configuration.
//
// Two ways to run it:
//
//	AUTH_MODE=github  ... SESSION_POD_TEMPLATE=/etc/hub/session-pod.json
//	AUTH_MODE=none    ... SESSION_UPSTREAM=127.0.0.1:8080
//
// The second needs no Kubernetes at all: it puts the whole hub —
// admission, seats, the queue, the recycle protocol, the proxy — in
// front of a local `./sim up`, which is the only place the whole
// simulator runs without a cluster. What it cannot do is rebuild
// anything, so a reset there completes the protocol over the same
// facilitator rather than a fresh one.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"kubestronaut-sim/hub/internal/api"
	"kubestronaut-sim/hub/internal/auth"
	"kubestronaut-sim/hub/internal/kube"
	"kubestronaut-sim/hub/internal/session"
	"kubestronaut-sim/hub/internal/store"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("hub: %v", err)
	}
}

func run() error {
	addr := envOr("ADDR", ":8080")
	stateDir := envOr("STATE_DIR", "/state")

	mode, err := auth.ParseMode(envOr("AUTH_MODE", string(auth.ModeGitHub)))
	if err != nil {
		return err
	}
	secure := envOr("COOKIE_SECURE", "true") != "false"
	ttl, err := time.ParseDuration(envOr("SESSION_TTL", "12h"))
	if err != nil {
		return fmt.Errorf("SESSION_TTL: %w", err)
	}

	a := &auth.Authenticator{
		Mode:       mode,
		HeaderName: envOr("AUTH_HEADER", "X-Forwarded-User"),
		Secure:     secure,
		TTL:        ttl,
	}

	// Configuration is validated before anything is created. Both a
	// missing client secret and an unwritable state directory stop the
	// process, but only one of them is reported first, and the useful
	// one to report is the configuration: a hub run with no environment
	// at all should say what it needs, not what it could not mkdir.
	baseURL := strings.TrimSuffix(os.Getenv("HUB_BASE_URL"), "/")
	var ingest *auth.Signer
	if mode == auth.ModeGitHub {
		// Every one of these is required, and a hub that starts without
		// them would look healthy and fail at the first login. Checked
		// here, once, with a message that names what is missing.
		key := os.Getenv("COOKIE_KEY")
		id, secret := os.Getenv("GITHUB_CLIENT_ID"), os.Getenv("GITHUB_CLIENT_SECRET")
		var missing []string
		for name, v := range map[string]string{
			"COOKIE_KEY": key, "GITHUB_CLIENT_ID": id,
			"GITHUB_CLIENT_SECRET": secret, "HUB_BASE_URL": baseURL,
		} {
			if v == "" {
				missing = append(missing, name)
			}
		}
		if len(missing) > 0 {
			sort.Strings(missing)
			return fmt.Errorf("AUTH_MODE=github needs %s", strings.Join(missing, ", "))
		}
		signer, err := auth.NewSigner([]byte(key))
		if err != nil {
			return err
		}
		a.Signer = signer
		a.GitHub = auth.NewGitHub(id, secret, baseURL+"/hub/auth/callback")
	}

	// Follows COOKIE_KEY rather than the auth mode, deliberately.
	//
	// AUTH_MODE=header issues no cookie and so needs no key of its own —
	// but it is the self-hosting path, and a deployment there with seats
	// and a proxy and silently no durable history would be the one thing
	// a hosted tier is for, missing. Setting COOKIE_KEY is what turns
	// attempt collection on; github mode requires it anyway.
	//
	// Derived, not the same key: see auth.Derive. A ticket read out of a
	// Pod spec must not be spendable as that candidate's login.
	if key := os.Getenv("COOKIE_KEY"); key != "" {
		ingest, err = auth.NewSigner(auth.Derive([]byte(key), auth.PurposeIngest))
		if err != nil {
			return err
		}
	}

	if mode == auth.ModeHeader {
		// Said out loud at boot because the failure is silent: a hub
		// reachable directly in this mode lets anyone claim any identity
		// by setting one header.
		log.Printf("hub: AUTH_MODE=header trusts %q — this process MUST NOT be reachable except through the proxy that sets it", a.HeaderName)
	}

	st, err := store.New(stateDir)
	if err != nil {
		return err
	}
	srv := &api.Server{Auth: a, Store: st, BaseURL: baseURL, Ingest: ingest}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	mgr, err := buildManager(newTicketer(ingest, baseURL, envDuration("SESSION_MAX_AGE", 10*time.Hour)))
	if err != nil {
		return err
	}
	if mgr != nil {
		srv.Sessions = mgr
		srv.DefaultKind, err = session.ParseKind(envOr("DEFAULT_KIND", string(session.Practical)))
		if err != nil {
			return err
		}
		// Adopt before serving: a hub redeployed mid-exam that forgot its
		// sessions would put every candidate behind a queue for seats
		// that are already taken, with their own Pods running.
		if err := mgr.Adopt(ctx); err != nil {
			log.Printf("hub: %v (starting anyway with no adopted sessions)", err)
		}
		go mgr.Run(ctx, envDuration("REAP_INTERVAL", 30*time.Second))
	}

	log.Printf("hub listening on %s (auth %s, state %s, sessions %v)", addr, mode, stateDir, mgr != nil)
	// Timeouts, because this is an internet-facing process. No write
	// timeout: the session proxy carries the desktop's WebSocket, which
	// is long-lived by design.
	s := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		BaseContext:       func(net.Listener) context.Context { return ctx },
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		s.Shutdown(shutdown)
	}()
	if err := s.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// ticketGrace is how long a Pod's history ticket stays good past the
// hard session cap.
//
// It is not a second lease. The Pod is already gone by then; this only
// covers an attempt graded in the last minutes of a session whose POST
// is retrying while the hub restarts. A ticket that expired exactly at
// the cap would lose precisely the attempt that ran the full length.
const ticketGrace = time.Hour

// newTicketer returns the session.Config.Webhook for this deployment,
// or nil when nothing here can collect attempts — no signer (so no
// AUTH_MODE=github) or no base URL for the Pod to post back to. Nil is
// not a failure: it is a hub keeping seats and a proxy without a
// durable history, which is exactly what AUTH_MODE=none is.
func newTicketer(signer *auth.Signer, baseURL string, maxAge time.Duration) func(string) (string, string, error) {
	if signer == nil || baseURL == "" {
		return nil
	}
	endpoint := baseURL + "/hub/ingest/history"
	return func(user string) (string, string, error) {
		tok, err := signer.Encode(auth.Session{
			UserID:  user,
			Expires: time.Now().Add(maxAge + ticketGrace).Unix(),
		})
		if err != nil {
			return "", "", err
		}
		return endpoint, tok, nil
	}
}

// buildManager returns nil when this deployment serves identity and
// history only — which is a real configuration, not a degraded one: it
// is what the auth and store halves can be run and proved with before a
// cluster exists.
func buildManager(webhook func(string) (string, string, error)) (*session.Manager, error) {
	upstream := os.Getenv("SESSION_UPSTREAM")
	practical := os.Getenv("SESSION_POD_TEMPLATE")
	mcq := os.Getenv("SESSION_POD_TEMPLATE_MCQ")
	if upstream == "" && practical == "" && mcq == "" {
		log.Print("hub: no SESSION_UPSTREAM or SESSION_POD_TEMPLATE — serving identity and history only")
		return nil, nil
	}

	readyContainer := envOr("READY_CONTAINER", "facilitator")
	cfg := session.Config{
		Flavours:        map[session.Kind]session.Flavour{},
		HoldFor:         envDuration("QUEUE_HOLD", 2*time.Minute),
		IdleAfter:       envDuration("IDLE_TIMEOUT", 30*time.Minute),
		MaxAge:          envDuration("SESSION_MAX_AGE", 10*time.Hour),
		BootTimeout:     envDuration("BOOT_TIMEOUT", 20*time.Minute),
		BootConcurrency: envInt("BOOT_CONCURRENCY", 1),
		ReadyContainer:  readyContainer,
		Port:            envInt("SESSION_PORT", 8080),
		PodPrefix:       envOr("POD_PREFIX", "sim-session"),
		Labels: map[string]string{
			"app.kubernetes.io/name":      "kubestronaut-sim",
			"app.kubernetes.io/component": "session",
		},
		Webhook: webhook,
		Logf:    log.Printf,
	}

	var pods session.Pods
	if upstream != "" {
		// The local path. One fixed address, a real Pod lifecycle on top
		// of it, and no cluster.
		host, port, err := net.SplitHostPort(upstream)
		if err != nil {
			return nil, fmt.Errorf("SESSION_UPSTREAM must be host:port: %w", err)
		}
		p, err := strconv.Atoi(port)
		if err != nil {
			return nil, fmt.Errorf("SESSION_UPSTREAM port: %w", err)
		}
		cfg.Port = p
		pods = &session.Static{Host: host}
		log.Printf("hub: SESSION_UPSTREAM=%s — every session proxies to this one address", upstream)
	} else {
		client, err := kube.InCluster()
		if err != nil {
			return nil, err
		}
		if ns := os.Getenv("SESSION_NAMESPACE"); ns != "" {
			client.Namespace = ns
		}
		pods = &session.KubePods{Client: client, ReadyContainer: readyContainer}
		log.Printf("hub: creating session Pods in namespace %s", client.Namespace)
	}

	for kind, spec := range map[session.Kind]struct{ path, seats, bank string }{
		session.Practical: {practical, "PRACTICAL_SEATS", "PRACTICAL_BANK"},
		session.MCQ:       {mcq, "MCQ_SEATS", "MCQ_BANK"},
	} {
		seats := envInt(spec.seats, 0)
		if spec.path == "" && upstream == "" {
			continue
		}
		if seats <= 0 {
			continue
		}
		var tmpl session.Template
		if spec.path != "" {
			b, err := os.ReadFile(spec.path)
			if err != nil {
				return nil, fmt.Errorf("read %s: %w", spec.path, err)
			}
			tmpl = b
		} else {
			// SESSION_UPSTREAM has no Pod to create, but the manager
			// still renders a manifest to name and label the thing it is
			// tracking. A minimal one keeps that path identical to the
			// real one rather than special-cased — including declaring
			// the webhook vars, so a render that would fail against the
			// real template fails here too rather than only in the
			// cluster. Nothing reads them: the upstream is a `./sim up`
			// this process did not start and cannot configure.
			tmpl = session.Template(`{"kind":"Pod","metadata":{},"spec":{"containers":[{"name":"facilitator","env":[` +
				`{"name":"BANK","value":""},` +
				`{"name":"HISTORY_WEBHOOK_URL","value":""},` +
				`{"name":"HISTORY_WEBHOOK_TOKEN","value":""}]}]}}`)
		}
		cfg.Flavours[kind] = session.Flavour{
			Seats: seats, Template: tmpl, Bank: os.Getenv(spec.bank),
		}
		log.Printf("hub: %s sessions: %d seat(s)", kind, seats)
	}
	if len(cfg.Flavours) == 0 {
		return nil, errors.New("hub: sessions are configured but no flavour has seats — set PRACTICAL_SEATS and/or MCQ_SEATS")
	}
	return session.New(pods, cfg), nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Printf("hub: %s=%q is not a number; using %d", key, v, fallback)
		return fallback
	}
	return n
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		log.Printf("hub: %s=%q is not a duration; using %s", key, v, fallback)
		return fallback
	}
	return d
}
