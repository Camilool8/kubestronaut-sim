# Milestone B — Desktop with docs-only browser: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** XFCE/noVNC desktop at `http://localhost:6080` whose Firefox can only reach exam-allowed doc domains, enforced at the network layer by a Go forward proxy.

**Architecture:** Two new services: `docs-proxy` (Go CONNECT proxy, allowlist from the bank's `exam.yaml`, first Go code in the repo) and `desktop` (XFCE + TigerVNC + noVNC + firefox-esr). The desktop sits on `examnet`, a bridge with IP masquerade disabled — its only internet path is the proxy; instances/k8s-env are reachable internally.

**Tech Stack:** Go 1.24 (stdlib only), debian:12-slim, TigerVNC, noVNC/websockify (Debian packages), firefox-esr, Docker Compose.

## Global Constraints

- No host Go toolchain: run all Go commands via `docker run --rm -v "$PWD/proxy":/w -w /w golang:1.24 go <cmd>`.
- Images must build on arm64 and amd64 (no arch-specific downloads; use apt/apk packages or Go cross-compilation).
- Proxy binary is bank-agnostic: allowlist comes ONLY from `ALLOWED_DOMAINS` env; bank extraction happens in the image entrypoint.
- Ports bind `127.0.0.1` only.
- Licenses: code Apache-2.0 (already repo-wide).
- **Spec deviation (apply in Task 5):** spec says `examnet` is `internal: true`; Docker does not forward published ports on internal networks, so use a bridge with `com.docker.network.bridge.enable_ip_masquerade: "false"` instead (same guarantee: no NAT egress). Also, allowlist extraction runs in the docs-proxy entrypoint (not the `sim` wrapper) to avoid a host `yq` dependency. Update the spec file accordingly.
- Work on branch `feat/milestone-b-desktop` off `main`.

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b feat/milestone-b-desktop main`

---

### Task 1: Allowlist package (Go, TDD)

**Files:**
- Create: `proxy/go.mod`
- Create: `proxy/internal/allow/allow.go`
- Test: `proxy/internal/allow/allow_test.go`

**Interfaces:**
- Produces: `allow.New(commaSeparated string) *allow.List`, `(*allow.List).Host(hostport string) bool` — Task 2 imports these.

- [ ] **Step 1: Create the module**

`proxy/go.mod`:
```
module kubestronaut-sim/proxy

go 1.24
```

- [ ] **Step 2: Write the failing test**

`proxy/internal/allow/allow_test.go`:
```go
package allow

import "testing"

func TestHost(t *testing.T) {
	l := New("kubernetes.io, helm.sh")
	cases := []struct {
		host string
		want bool
	}{
		{"kubernetes.io", true},
		{"kubernetes.io:443", true},
		{"docs.kubernetes.io", true},
		{"KUBERNETES.IO:443", true},
		{"kubernetes.io.", true},
		{"helm.sh:443", true},
		{"evilkubernetes.io", false},
		{"kubernetes.io.evil.com", false},
		{"example.com:443", false},
		{"", false},
	}
	for _, c := range cases {
		if got := l.Host(c.host); got != c.want {
			t.Errorf("Host(%q) = %v, want %v", c.host, got, c.want)
		}
	}
}

func TestHostEmptyList(t *testing.T) {
	if New("").Host("kubernetes.io") {
		t.Error("empty allowlist must block everything")
	}
}
```

- [ ] **Step 3: Run test, verify it fails**

Run: `docker run --rm -v "$PWD/proxy":/w -w /w golang:1.24 go test ./...`
Expected: FAIL — `undefined: New`

- [ ] **Step 4: Implement**

`proxy/internal/allow/allow.go`:
```go
// Package allow implements the docs-domain allowlist: a host matches when
// it equals an allowed domain or is a subdomain of one (whole-label match,
// so "kubernetes.io" never matches "evilkubernetes.io").
package allow

import (
	"net"
	"strings"
)

type List struct{ domains []string }

func New(commaSeparated string) *List {
	l := &List{}
	for _, d := range strings.Split(commaSeparated, ",") {
		d = strings.ToLower(strings.Trim(strings.TrimSpace(d), "."))
		if d != "" {
			l.domains = append(l.domains, d)
		}
	}
	return l
}

func (l *List) Host(hostport string) bool {
	host := hostport
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		host = h
	}
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	if host == "" {
		return false
	}
	for _, d := range l.domains {
		if host == d || strings.HasSuffix(host, "."+d) {
			return true
		}
	}
	return false
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `docker run --rm -v "$PWD/proxy":/w -w /w golang:1.24 go test ./...`
Expected: `ok  	kubestronaut-sim/proxy/internal/allow`

- [ ] **Step 6: Commit**

```bash
git add proxy && git commit -m "feat(proxy): allowlist matcher package"
```

---

### Task 2: Forward proxy server (Go, TDD)

**Files:**
- Create: `proxy/internal/server/server.go`
- Create: `proxy/cmd/docs-proxy/main.go`
- Test: `proxy/internal/server/server_test.go`

**Interfaces:**
- Consumes: `allow.New`, `(*allow.List).Host` from Task 1.
- Produces: `server.New(list *allow.List) http.Handler`; binary `docs-proxy` listening on `:3128`, env `ALLOWED_DOMAINS` (default `kubernetes.io,helm.sh`).

- [ ] **Step 1: Write the failing tests**

`proxy/internal/server/server_test.go`:
```go
package server

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"kubestronaut-sim/proxy/internal/allow"
)

// startProxy returns the proxy's listen address.
func startProxy(t *testing.T, domains string) string {
	t.Helper()
	srv := httptest.NewServer(New(allow.New(domains)))
	t.Cleanup(srv.Close)
	u, _ := url.Parse(srv.URL)
	return u.Host
}

func TestConnectBlocked(t *testing.T) {
	addr := startProxy(t, "kubernetes.io")
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	fmt.Fprintf(conn, "CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n")
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("CONNECT to blocked host: got %d, want 403", resp.StatusCode)
	}
}

func TestConnectAllowedTunnels(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "hello-tunnel")
	}))
	defer backend.Close()
	bu, _ := url.Parse(backend.URL)

	addr := startProxy(t, "127.0.0.1")
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	fmt.Fprintf(conn, "CONNECT %s HTTP/1.1\r\nHost: %s\r\n\r\n", bu.Host, bu.Host)
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("CONNECT to allowed host: got %d, want 200", resp.StatusCode)
	}
	// speak plain HTTP through the tunnel
	fmt.Fprintf(conn, "GET / HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", bu.Host)
	body, _ := io.ReadAll(br)
	if !strings.Contains(string(body), "hello-tunnel") {
		t.Fatalf("tunnel did not reach backend, got: %q", body)
	}
}

func TestPlainHTTPProxy(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "plain-ok")
	}))
	defer backend.Close()

	addr := startProxy(t, "127.0.0.1")
	proxyURL, _ := url.Parse("http://" + addr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	resp, err := client.Get(backend.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 || string(body) != "plain-ok" {
		t.Fatalf("got %d %q", resp.StatusCode, body)
	}
}

func TestPlainHTTPBlocked(t *testing.T) {
	addr := startProxy(t, "kubernetes.io")
	proxyURL, _ := url.Parse("http://" + addr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	resp, err := client.Get("http://example.com/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("got %d, want 403", resp.StatusCode)
	}
}

func TestNonProxyRequestRejected(t *testing.T) {
	addr := startProxy(t, "kubernetes.io")
	resp, err := http.Get("http://" + addr + "/relative")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", resp.StatusCode)
	}
}
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `docker run --rm -v "$PWD/proxy":/w -w /w golang:1.24 go test ./...`
Expected: FAIL — `undefined: New` in package server

- [ ] **Step 3: Implement**

`proxy/internal/server/server.go`:
```go
// Package server is a forward HTTP proxy that only relays to allowlisted
// hosts: CONNECT tunnels for HTTPS, plain proxying for HTTP. No TLS
// interception.
package server

import (
	"io"
	"log"
	"net"
	"net/http"
	"time"

	"kubestronaut-sim/proxy/internal/allow"
)

func New(list *allow.List) http.Handler {
	return &proxy{list: list}
}

type proxy struct{ list *allow.List }

func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		p.connect(w, r)
		return
	}
	if !r.URL.IsAbs() {
		http.Error(w, "docs-proxy: not a proxy request", http.StatusBadRequest)
		return
	}
	if !p.list.Host(r.Host) {
		log.Printf("blocked host=%s", r.Host)
		http.Error(w, "blocked by exam docs allowlist", http.StatusForbidden)
		return
	}
	r.RequestURI = ""
	resp, err := http.DefaultTransport.RoundTrip(r)
	if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (p *proxy) connect(w http.ResponseWriter, r *http.Request) {
	if !p.list.Host(r.Host) {
		log.Printf("blocked host=%s", r.Host)
		http.Error(w, "blocked by exam docs allowlist", http.StatusForbidden)
		return
	}
	dst, err := net.DialTimeout("tcp", r.Host, 10*time.Second)
	if err != nil {
		http.Error(w, "upstream dial failed", http.StatusBadGateway)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		dst.Close()
		http.Error(w, "hijacking unsupported", http.StatusInternalServerError)
		return
	}
	src, _, err := hj.Hijack()
	if err != nil {
		dst.Close()
		return
	}
	src.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))
	go func() {
		io.Copy(dst, src)
		dst.Close()
	}()
	io.Copy(src, dst)
	src.Close()
}
```

`proxy/cmd/docs-proxy/main.go`:
```go
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"kubestronaut-sim/proxy/internal/allow"
	"kubestronaut-sim/proxy/internal/server"
)

func main() {
	domains := os.Getenv("ALLOWED_DOMAINS")
	if domains == "" {
		domains = "kubernetes.io,helm.sh"
	}
	log.Printf("docs-proxy on :3128, allowed domains: %s", domains)
	srv := &http.Server{
		Addr:              ":3128",
		Handler:           server.New(allow.New(domains)),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
```

Note: httptest's server may log "response.WriteHeader on hijacked connection" warnings in the tunnel test; that's harmless.

- [ ] **Step 4: Run tests, verify pass**

Run: `docker run --rm -v "$PWD/proxy":/w -w /w golang:1.24 go test ./...`
Expected: `ok` for both packages, no failures.

- [ ] **Step 5: Vet**

Run: `docker run --rm -v "$PWD/proxy":/w -w /w golang:1.24 go vet ./...`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add proxy && git commit -m "feat(proxy): CONNECT forward proxy with docs allowlist"
```

---

### Task 3: docs-proxy image

**Files:**
- Create: `proxy/Dockerfile`
- Create: `proxy/entrypoint.sh`

**Interfaces:**
- Consumes: `proxy/` Go module from Tasks 1–2.
- Produces: image serving on `:3128`; env contract: `ALLOWED_DOMAINS` (explicit override) or `BANK` + mounted `/banks` (entrypoint extracts `spec.environment.allowedDomains`, defaulting to `kubernetes.io,helm.sh`). Task 5 wires this into compose.

- [ ] **Step 1: Write the Dockerfile**

`proxy/Dockerfile`:
```dockerfile
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -o /docs-proxy ./cmd/docs-proxy

FROM alpine:3.21
RUN apk add --no-cache yq-go
COPY --from=build /docs-proxy /docs-proxy
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3128
ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 2: Write the entrypoint**

`proxy/entrypoint.sh`:
```sh
#!/bin/sh
# Bank-aware wrapper: the Go binary is env-driven only; this extracts the
# bank's allowlist when ALLOWED_DOMAINS isn't set explicitly.
set -eu
if [ -z "${ALLOWED_DOMAINS:-}" ] && [ -n "${BANK:-}" ] && [ -f "/banks/${BANK}/exam.yaml" ]; then
  ALLOWED_DOMAINS=$(yq -r '(.spec.environment.allowedDomains // ["kubernetes.io","helm.sh"]) | join(",")' "/banks/${BANK}/exam.yaml")
  export ALLOWED_DOMAINS
fi
exec /docs-proxy
```

- [ ] **Step 3: Build and probe standalone**

```bash
docker build -t sim-docs-proxy-test proxy
docker run -d --rm --name dp-test -p 127.0.0.1:13128:3128 \
  -v "$PWD/banks":/banks:ro -e BANK=ckad-mock-01 sim-docs-proxy-test
sleep 2
docker logs dp-test                                    # expect: allowed domains: kubernetes.io,helm.sh
curl -fsS -o /dev/null -x http://127.0.0.1:13128 https://kubernetes.io && echo ALLOW-OK
curl -s -o /dev/null -x http://127.0.0.1:13128 https://example.com || echo BLOCK-OK
docker rm -f dp-test
```
Expected: `ALLOW-OK` and `BLOCK-OK` both print; log line shows the extracted domains.

- [ ] **Step 4: Commit**

```bash
git add proxy/Dockerfile proxy/entrypoint.sh && git commit -m "feat(proxy): docs-proxy image with bank-aware entrypoint"
```

---

### Task 4: desktop image

**Files:**
- Create: `images/desktop/Dockerfile`
- Create: `images/desktop/entrypoint.sh`
- Create: `images/desktop/policies.json`
- Create: `images/desktop/ssh_config`

**Interfaces:**
- Consumes: `/shared/ssh/id_ed25519` (k8s-env generates it; mounted ro), `docs-proxy:3128` (Task 3).
- Produces: noVNC on container port `6080` (page `/vnc.html`); user `candidate` with `ssh ckad-1` / `ssh ckad-2` working. Task 5 wires networks/ports.

- [ ] **Step 1: Write the Dockerfile**

`images/desktop/Dockerfile`:
```dockerfile
FROM debian:12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      xfce4-session xfwm4 xfdesktop4 xfce4-panel xfce4-settings xfce4-terminal \
      dbus-x11 tigervnc-standalone-server novnc websockify \
      firefox-esr openssh-client curl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -s /bin/bash candidate \
    && printf '\necho "Exam desktop — solve questions via: ssh ckad-1 (or ckad-2). Docs: Firefox (allowlisted)."\n' >> /home/candidate/.bashrc
COPY policies.json /etc/firefox-esr/policies.json
COPY ssh_config /etc/sim/ssh_config
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 6080
ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 2: Write the Firefox policy**

`images/desktop/policies.json`:
```json
{
  "policies": {
    "Proxy": {
      "Mode": "manual",
      "HTTPProxy": "docs-proxy:3128",
      "SSLProxy": "docs-proxy:3128",
      "Locked": true
    },
    "Homepage": { "URL": "https://kubernetes.io/docs/", "Locked": true, "StartPage": "homepage" },
    "OverrideFirstRunPage": "https://kubernetes.io/docs/",
    "DisableTelemetry": true,
    "DisableFirefoxStudies": true,
    "DisableAppUpdate": true,
    "DisablePrivateBrowsing": true,
    "BlockAboutConfig": true,
    "DontCheckDefaultBrowser": true,
    "ExtensionSettings": { "*": { "installation_mode": "blocked" } }
  }
}
```

- [ ] **Step 3: Write the ssh config**

`images/desktop/ssh_config`:
```
Host ckad-1 ckad-2
  User candidate
  IdentityFile ~/.ssh/id_ed25519
  StrictHostKeyChecking accept-new
```

- [ ] **Step 4: Write the entrypoint**

`images/desktop/entrypoint.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
echo "waiting for shared ssh key..."
until [ -f /shared/ssh/id_ed25519 ]; do sleep 2; done
install -d -m 700 -o candidate -g candidate /home/candidate/.ssh
install -m 600 -o candidate -g candidate /shared/ssh/id_ed25519 /home/candidate/.ssh/id_ed25519
install -m 644 -o candidate -g candidate /etc/sim/ssh_config /home/candidate/.ssh/config

su - candidate -c 'Xvnc :1 -geometry 1440x900 -depth 24 -SecurityTypes None -localhost yes' &
until su - candidate -c 'DISPLAY=:1 xset q' >/dev/null 2>&1; do sleep 1; done
su - candidate -c 'DISPLAY=:1 dbus-launch startxfce4' &
websockify --web /usr/share/novnc 6080 localhost:5901 &
echo "desktop ready: noVNC on :6080"
wait -n   # exit (and let compose restart us) if any component dies
```

- [ ] **Step 5: Build and probe standalone**

```bash
docker build -t sim-desktop-test images/desktop
mkdir -p /tmp/desk-shared/ssh && ssh-keygen -t ed25519 -N '' -q -f /tmp/desk-shared/ssh/id_ed25519
docker run -d --rm --name desk-test -p 127.0.0.1:16080:6080 -v /tmp/desk-shared:/shared:ro sim-desktop-test
sleep 8
curl -fsS -o /dev/null http://127.0.0.1:16080/vnc.html && echo NOVNC-OK
docker exec desk-test su - candidate -c 'test -f ~/.ssh/config && ls ~/.ssh/id_ed25519' && echo SSH-WIRED-OK
docker rm -f desk-test && rm -rf /tmp/desk-shared
```
Expected: `NOVNC-OK` and `SSH-WIRED-OK`. (Open http://127.0.0.1:16080/vnc.html manually if you want to eyeball XFCE before teardown.)

- [ ] **Step 6: Commit**

```bash
git add images/desktop && git commit -m "feat(desktop): XFCE + TigerVNC + noVNC image with locked-down Firefox"
```

---

### Task 5: Compose + sim wiring, bank contract, spec sync

**Files:**
- Modify: `docker-compose.yaml`
- Modify: `sim` (up message only)
- Modify: `docs/bank-spec.md`
- Modify: `banks/ckad-mock-01/exam.yaml`
- Modify: `docs/superpowers/specs/2026-07-22-milestone-b-desktop-design.md` (deviation notes)

**Interfaces:**
- Consumes: images from Tasks 3–4 and their env contracts (`BANK`, `ALLOWED_DOMAINS`).
- Produces: `./sim up` brings up the full stack with desktop at `http://localhost:6080/vnc.html`; `examnet` has no NAT egress.

- [ ] **Step 1: Add services and networks to `docker-compose.yaml`**

Append to `services:` (same level as `ckad-2`):
```yaml
  docs-proxy:
    build: proxy
    hostname: docs-proxy
    environment:
      BANK: ${BANK:-ckad-mock-01}
    volumes:
      - ./banks:/banks:ro
    networks: [default, examnet]
  desktop:
    build: images/desktop
    hostname: desktop
    ports:
      - "127.0.0.1:6080:6080"
    depends_on:
      k8s-env: {condition: service_healthy}
      docs-proxy: {condition: service_started}
    volumes:
      - shared:/shared:ro
    networks: [examnet]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:6080/vnc.html"]
      interval: 10s
      timeout: 3s
      retries: 30
      start_period: 15s
    restart: unless-stopped
```

Add `networks: [default, examnet]` to the existing `k8s-env`, `ckad-1`, and `ckad-2` services (they must stay on `default` for internet/DinD while joining `examnet` so the desktop can reach them).

Append the top-level networks block (after `volumes:`):
```yaml
networks:
  default: {}
  examnet:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: "false"
```

- [ ] **Step 2: Update `./sim up` output**

In `sim`, replace the `up)` echo line:
```bash
    echo "Exam environment ready. Desktop: http://localhost:6080/vnc.html — or ./sim ssh ckad-1"
```

- [ ] **Step 3: Bank contract**

`docs/bank-spec.md`, add to the runtime environment bullet list:
```markdown
- `spec.environment.allowedDomains` (optional, default
  `[kubernetes.io, helm.sh]`): domain suffixes the exam desktop's browser
  may reach through the docs proxy; subdomains included.
```

`banks/ckad-mock-01/exam.yaml`, extend `environment:`:
```yaml
  environment:
    provider: kind
    nodes: 2
    allowedDomains: [kubernetes.io, helm.sh]
```

- [ ] **Step 4: Sync the spec's two deviations**

In `docs/superpowers/specs/2026-07-22-milestone-b-desktop-design.md`:
- Replace the `internal: true` bullet (Decisions) and the `examnet (internal: true)` line (Compose section) with: bridge network with `com.docker.network.bridge.enable_ip_masquerade: "false"` — Docker doesn't forward published ports on `internal` networks; masquerade-off gives the same no-NAT-egress guarantee while keeping the `127.0.0.1:6080` publish (asserted by smoke).
- Replace the "`docs-proxy` gets `ALLOWED_DOMAINS` from `yq` at `./sim up` time" line with: the docs-proxy image entrypoint extracts `allowedDomains` from the mounted bank when `ALLOWED_DOMAINS` isn't set, avoiding a host `yq` dependency; the Go binary remains env-only.

- [ ] **Step 5: Bring the stack up and verify by hand**

```bash
./sim up
docker compose ps                                             # all services Up, desktop healthy
curl -fsS -o /dev/null http://localhost:6080/vnc.html && echo NOVNC-OK
docker compose exec desktop curl -fsS -o /dev/null -x http://docs-proxy:3128 https://kubernetes.io && echo ALLOW-OK
docker compose exec desktop curl -s -o /dev/null -x http://docs-proxy:3128 https://example.com || echo BLOCK-OK
docker compose exec desktop curl -s --max-time 5 -o /dev/null https://example.com || echo NO-EGRESS-OK
docker compose exec desktop su - candidate -c 'ssh -o BatchMode=yes ckad-1 kubectl get nodes --no-headers' | grep -c ' Ready '   # expect 2
```
Expected: NOVNC-OK, ALLOW-OK, BLOCK-OK, NO-EGRESS-OK, `2`. Also open http://localhost:6080/vnc.html in a browser: XFCE desktop, Firefox loads kubernetes.io/docs, any other site shows the proxy's block response, proxy settings greyed out.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yaml sim docs/bank-spec.md banks/ckad-mock-01/exam.yaml docs/superpowers/specs/2026-07-22-milestone-b-desktop-design.md
git commit -m "feat: wire desktop + docs-proxy into compose; per-bank allowedDomains"
```

---

### Task 6: Smoke extension, README, full verification

**Files:**
- Modify: `tests/smoke.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: full stack from Task 5.
- Produces: lifecycle smoke also asserting desktop/proxy behavior.

- [ ] **Step 1: Extend the smoke test**

In `tests/smoke.sh`, insert after the `[ "$(grep -c ' Ready ' /tmp/nodes.txt)" -eq 2 ] || fail ...` line:
```bash
# desktop: noVNC served; proxy allowlist enforced; no direct egress; ssh works
curl -fsS -o /dev/null http://localhost:6080/vnc.html || fail "noVNC not serving"
docker compose exec desktop curl -fsS -o /dev/null -x http://docs-proxy:3128 https://kubernetes.io \
  || fail "proxy should allow kubernetes.io"
docker compose exec desktop curl -s -o /dev/null -x http://docs-proxy:3128 https://example.com \
  && fail "proxy should block example.com" || true
docker compose exec desktop curl -s --max-time 5 -o /dev/null https://example.com \
  && fail "desktop should have no direct egress" || true
docker compose exec desktop su - candidate -c 'ssh -o BatchMode=yes ckad-1 kubectl get nodes --no-headers' \
  | grep -q ' Ready ' || fail "desktop->ckad-1 ssh broken"
```

- [ ] **Step 2: README quickstart**

In `README.md`, after the `./sim up` line in the quickstart, add:
```markdown
    open http://localhost:6080/vnc.html   # exam desktop (Firefox = docs only)
```
And extend the requirements line to mention the desktop: `~8GB RAM free` → `~9GB RAM free (XFCE desktop included)`.

- [ ] **Step 3: Full cold-start smoke**

Run: `./tests/smoke.sh` (background it; ~15 min)
Expected: `SMOKE PASS (17/17 solved, 0/17 fresh, 17/17 resumed, 0 after reset)` with the new desktop assertions passing silently along the way.

- [ ] **Step 4: Commit**

```bash
git add tests/smoke.sh README.md && git commit -m "test: desktop/proxy smoke assertions; docs: desktop quickstart"
```

---

### Task 7: Finish the branch

- [ ] **Step 1:** Use superpowers:finishing-a-development-branch (verify smoke evidence is fresh, then offer merge options).
