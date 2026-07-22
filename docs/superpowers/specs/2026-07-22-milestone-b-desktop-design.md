# Milestone B — Desktop with docs-only browser (design)

Date: 2026-07-22. Follows the MVP design
(`2026-07-21-kubestronaut-sim-mvp-design.md`); supersedes its desktop
sketch where they differ.

## Goal

Reproduce the real exam's remote-desktop workflow locally: candidate opens
a browser at `http://localhost:6080`, gets an XFCE desktop with a terminal
(ssh pre-wired to instances) and a Firefox that can reach only the
exam-allowed documentation domains. No React UI yet (Milestone C embeds
this desktop via iframe).

## Decisions

- **Always on**: `./sim up` starts the desktop; `./sim ssh` remains a
  convenience shortcut for dogfooding.
- **Tiny Go forward proxy** (first Go code in the repo), not
  Squid/tinyproxy: CONNECT + plain-HTTP handling with a host-suffix
  allowlist. No TLS interception.
- **Per-bank allowlist**: `spec.environment.allowedDomains` in
  `exam.yaml`; defaults to `[kubernetes.io, helm.sh]` when absent.
  Matching is by domain suffix on whole labels (`kubernetes.io` allows
  `kubernetes.io` and `*.kubernetes.io`, never `evilkubernetes.io`).
- **Network-enforced, not browser-enforced**: the desktop sits on an
  `internal: true` compose network whose only egress path is the
  `docs-proxy` container. Firefox policy lockdown is UX, the network is
  the guarantee.
- **No VNC password, localhost-only publish**: single-user local stack;
  ports bind `127.0.0.1`.

## Components

### 1. `docs-proxy` — Go forward proxy

- Layout: `proxy/` (module root `go.mod`, package `main` in
  `proxy/cmd/docs-proxy`, allowlist logic in `proxy/internal/allow`).
- Behavior: HTTP proxy on `:3128`. `CONNECT host:port` → allowed suffix ⇒
  bidirectional tunnel; otherwise `403` and a `blocked host=<h>` log line.
  Plain HTTP requests proxied with the same host check.
- Allowlist source: `ALLOWED_DOMAINS` env (comma-separated). The compose
  layer extracts it from the bank's `exam.yaml` — the proxy binary stays
  bank-agnostic.
- Image: multi-stage build (golang → scratch/distroless), arm64 + amd64.
- Unit tests: allowlist matcher table tests (exact, subdomain, suffix
  spoof, port stripping, case).

### 2. `desktop` image

- Base `debian:12-slim` (same family as `instance`). XFCE4 (minimal
  meta-package set), TigerVNC (`Xvnc`), noVNC + websockify, `firefox-esr`,
  `openssh-client`, `curl`. User `candidate`.
- Entrypoint starts, in order: `Xvnc :1` (no auth, listening only on
  container localhost), XFCE session, websockify serving noVNC on `:6080`.
  Simple shell supervision (`wait -n`; container exits if any dies —
  compose restarts it).
- Firefox `policies.json`: fixed proxy `docs-proxy:3128` for all
  protocols, proxy settings locked, homepage `https://kubernetes.io/docs/`,
  disable telemetry/updates/extensions/private browsing.
- `/home/candidate/.ssh/config`: `Host ckad-1, ckad-2` → user `candidate`,
  shared key from `/shared/ssh` (mounted ro), `StrictHostKeyChecking
  accept-new`. Terminal motd explains the ssh-instance model.
- Healthcheck: HTTP 200 from `localhost:6080`.

### 3. Compose / `sim` changes

- New services `docs-proxy` and `desktop`. Networks:
  - `default` — k8s-env, instances, docs-proxy (egress to internet).
  - `examnet` (`internal: true`) — desktop, docs-proxy, instances,
    k8s-env. Desktop joins only `examnet`: its sole internet path is the
    proxy; ssh and kubectl stay internal.
- `desktop` publishes `127.0.0.1:6080:6080`. Depends on `docs-proxy`
  (started) and `k8s-env` (healthy, for the shared ssh key).
- `docs-proxy` gets `ALLOWED_DOMAINS` from `yq` at `./sim up` time
  (wrapper extracts from the bank, exports env for compose interpolation;
  default in compose file covers direct `docker compose up`).
- `./sim up` final message includes `Desktop: http://localhost:6080`.
- `./sim reset` unchanged: desktop and proxy are stateless.

### 4. Bank contract (`docs/bank-spec.md`)

`spec.environment.allowedDomains: [string]` — optional, default
`[kubernetes.io, helm.sh]`. Documented as domain suffixes (subdomains
included). Add to `ckad-mock-01/exam.yaml` explicitly as an example.

## Error handling

- Proxy refuses malformed CONNECT targets and non-allowlisted hosts with
  403; never panics on bad input (table-tested).
- Desktop entrypoint fails fast (non-zero) if Xvnc or websockify die;
  compose `restart: unless-stopped` recovers it.
- If the bank lacks `allowedDomains`, defaults apply silently (documented).

## Testing / verification

- `proxy`: `go test ./...` (allowlist tables; httptest-based CONNECT
  allow/deny integration test).
- Smoke additions (after existing lifecycle assertions):
  - `curl -fsS localhost:6080` → 200 (noVNC page served).
  - In desktop: `curl -x docs-proxy:3128 https://kubernetes.io` → success;
    `curl -x docs-proxy:3128 https://example.com` → failure (403/refused).
  - In desktop: direct egress `curl --max-time 5 https://example.com`
    (no proxy) fails — proves network enforcement.
  - In desktop: `ssh ckad-1 kubectl get nodes` → 2 nodes.
- Manual (documented in README): open `localhost:6080`, browse docs,
  confirm blocked page for other sites.

## Out of scope (later milestones)

- React UI embedding noVNC, timer, session lock (Milestone C).
- Per-path allowlisting (would require MITM; domain-level only).
- VNC auth / TLS (hosted version concern).
