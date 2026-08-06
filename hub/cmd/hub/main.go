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
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"kubestronaut-sim/hub/internal/api"
	"kubestronaut-sim/hub/internal/auth"
	"kubestronaut-sim/hub/internal/catalog"
	"kubestronaut-sim/hub/internal/kube"
	"kubestronaut-sim/hub/internal/session"
	"kubestronaut-sim/hub/internal/store"
	"kubestronaut-sim/hub/internal/web"
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

	baseURL := strings.TrimSuffix(os.Getenv("HUB_BASE_URL"), "/")
	var ingest *auth.Signer
	if mode == auth.ModeGitHub {

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

	if key := os.Getenv("COOKIE_KEY"); key != "" {
		ingest, err = auth.NewSigner(auth.Derive([]byte(key), auth.PurposeIngest))
		if err != nil {
			return err
		}
	}

	if mode == auth.ModeHeader {

		log.Printf("hub: AUTH_MODE=header trusts %q — this process MUST NOT be reachable except through the proxy that sets it", a.HeaderName)
	}

	st, err := store.New(stateDir)
	if err != nil {
		return err
	}

	banks, err := catalog.Load(os.Getenv("BANKS_INDEX_DIR"))
	if err != nil {
		return err
	}
	if banks.Len() > 0 {
		log.Printf("hub: %d exam(s) available to choose from", banks.Len())
	}

	srv := &api.Server{Auth: a, Store: st, BaseURL: baseURL, Ingest: ingest, UI: web.FS(), Banks: banks}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	mgr, err := buildManager(newTicketer(ingest, baseURL, envDuration("SESSION_MAX_AGE", 10*time.Hour)), banks)
	if err != nil {
		return err
	}
	if mgr != nil {
		srv.Sessions = mgr
		srv.DefaultKind, err = session.ParseKind(envOr("DEFAULT_KIND", string(session.Practical)))
		if err != nil {
			return err
		}

		if err := mgr.Adopt(ctx); err != nil {
			log.Printf("hub: %v (starting anyway with no adopted sessions)", err)
		}
		go mgr.Run(ctx, envDuration("REAP_INTERVAL", 30*time.Second))
	}

	log.Printf("hub listening on %s (auth %s, state %s, sessions %v)", addr, mode, stateDir, mgr != nil)

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

const ticketGrace = time.Hour

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

func buildManager(webhook func(string) (string, string, error), banks *catalog.Catalog) (*session.Manager, error) {
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

			tmpl = session.Template(`{"kind":"Pod","metadata":{},"spec":{"containers":[{"name":"facilitator","env":[` +
				`{"name":"BANK","value":""},` +
				`{"name":"HISTORY_WEBHOOK_URL","value":""},` +
				`{"name":"HISTORY_WEBHOOK_TOKEN","value":""}]}]}}`)
		}
		cfg.Flavours[kind] = session.Flavour{
			Seats: seats, Template: tmpl, Bank: os.Getenv(spec.bank),
			BankTemplates: bankTemplates(spec.path, kind, banks),
		}
		log.Printf("hub: %s sessions: %d seat(s)", kind, seats)
	}
	if len(cfg.Flavours) == 0 {
		return nil, errors.New("hub: sessions are configured but no flavour has seats — set PRACTICAL_SEATS and/or MCQ_SEATS")
	}
	return session.New(pods, cfg), nil
}

func bankTemplates(basePath string, kind session.Kind, banks *catalog.Catalog) map[string]session.Template {
	if basePath == "" || banks == nil {
		return nil
	}
	dir := filepath.Dir(basePath)
	out := map[string]session.Template{}
	for _, entry := range banks.List() {
		if session.KindOf(entry.ExamType) != kind {
			continue
		}
		path := filepath.Join(dir, "session-bank-"+entry.ID+".json")
		raw, err := os.ReadFile(path)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {

			log.Printf("hub: read %s: %v (using the default session Pod for %s)", path, err, entry.ID)
			continue
		}
		out[entry.ID] = raw
		log.Printf("hub: %s uses its own session Pod spec", entry.ID)
	}
	if len(out) == 0 {
		return nil
	}
	return out
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
