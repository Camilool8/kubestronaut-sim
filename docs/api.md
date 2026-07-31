# HTTP API

There is no authentication on any endpoint: anyone who can reach the
port has every capability the exam UI has. See
[SECURITY.md](../SECURITY.md).

Two services. The facilitator serves the whole browser-facing surface
on port 8080 — the API, the embedded UI, the desktop proxy, and a
reverse proxy to the conductor. The conductor listens on `:9000` on an
`internal: true` network with no host port, and is reachable only
through that proxy (`facilitator/cmd/facilitator/main.go:170-174`).
Host ports are in [cli.md](cli.md).

Errors are `{"error":"..."}` as `application/json`
(`facilitator/internal/api/api.go:641`,
`conductor/internal/api/api.go:115`). Both `/healthz` endpoints answer
in plain text, and the desktop's locked responses in HTML or plain
text.

## Attempt modes

Mode is chosen at `POST /api/session/start` and is immutable for the
life of the attempt. Every gate below reads server-side session state,
never a request field
(`facilitator/internal/session/session.go:38-51`).

| Mode | Clock | Hints | Solutions while running | Score mid-attempt | Re-seed a question |
|---|---|---|---|---|---|
| `exam` | The bank's `spec.duration` | No | No | No | No |
| `training` | Untimed | Yes | Yes | Yes | Yes |
| `speed` | `spec.speedDuration`, or half the bank's duration | No | No | No | No |

## Session-state gates

Session state is `idle`, `running` or `ended`. An idle session reports
its mode as the empty string
(`facilitator/internal/session/session.go:616-617`), which is what
closes every mode-based gate below while idle.

| Gate | Open when | Closed response | Source |
|---|---|---|---|
| Solutions | `state == "ended"`, **or** `mode == "training"` | 403 | `facilitator/internal/api/api.go:265` |
| Hints | `mode == "training"` and `state != "idle"` | 403 | `facilitator/internal/api/api.go:323-328` |
| Mid-attempt score | `mode == "training"` and `state == "running"` | 403 on mode, 409 on state | `facilitator/internal/api/api.go:444-450` |
| Answer writes (mcq) | `state == "running"` | 409 | `facilitator/internal/api/api.go:376-379` |
| Desktop | `state == "running"`, any mode | 403 | `facilitator/cmd/facilitator/main.go:163-165` |
| Re-seed | `mode == "training"` and `state == "running"` | 403 | `conductor/internal/control/reseed.go:83-89` |
| Bank switch | `state != "running"` | 409 | `conductor/internal/control/control.go:198-204` |
| Reset | Always open | — | `conductor/internal/control/control.go:26-30` |

**The solutions gate is not "403 until the session has ended".** The
condition is `snap.State != "ended" && snap.Mode != session.ModeTraining`,
so a *running* Training attempt gets 200 — `tests/smoke.sh:560-561`
asserts exactly that. A running Exam or Speed attempt gets 403, and so
does an idle session, whose mode is empty whatever the last attempt
was.

None of these gates is a security control. Every `solution.md` and
`hints.md` sits unencrypted in `banks/` on your own disk throughout.

## Facilitator

### GET /healthz

Backs the compose healthcheck. Always 200, `text/plain`, body `ok`
(`facilitator/internal/api/api.go:109-113`).

### GET /api/boot

How far the exam environment has got through its own start-up. The UI
polls it while rendering the boot screen; `./sim up` prints the same
fields.

```json
{
  "state": "booting",
  "phase": "seed",
  "label": "Setting up the exam questions",
  "detail": "question 11 of 22",
  "error": "",
  "step": 7,
  "totalSteps": 8,
  "startedAt": "2026-07-28T09:12:44Z"
}
```

`state` is `booting`, `ready` or `failed`, and `error` is populated
only for `failed`. Always 200: "still building" is a normal answer to
this question, not an error
(`facilitator/internal/api/api.go:546-548`). The `/shared/ready` marker
is the authority on readiness and overrides whatever the phase file
claims, in both directions
(`facilitator/internal/bootstate/bootstate.go:95-129`).

### GET /api/exam

The active bank's metadata, its question list, and the three
selectable modes. Always 200.

```json
{
  "name": "ckad-mock-01",
  "title": "CKAD Mock Exam 01",
  "examType": "hands-on",
  "durationSeconds": 7200,
  "passingScore": 66,
  "kubernetesVersion": "1.35",
  "questions": [
    {"id": "q01", "instance": "instance-1", "domain": "Application Environment, Configuration and Security", "weight": 9, "totalPoints": 9, "hintCount": 2}
  ],
  "modes": [
    {"id": "exam", "durationSeconds": 7200, "untimed": false, "helpAllowed": false},
    {"id": "training", "durationSeconds": 0, "untimed": true, "helpAllowed": true},
    {"id": "speed", "durationSeconds": 3600, "untimed": false, "helpAllowed": false}
  ]
}
```

`examType` is `hands-on` or `mcq` (`facilitator/internal/exam/exam.go`
normalizes an absent `spec.examType` to `hands-on`). For hands-on,
`totalPoints` sums the question's checks, excluding any whose
`# points:` header was malformed
(`facilitator/internal/api/api.go:191-199`). For mcq questions the
entry is `{"id", "domain", "weight", "totalPoints", "hintCount",
"multi"}` — no `instance`, `totalPoints` equals `weight`, and `multi`
marks a select-all-that-apply question. `questions` marshals as `[]`,
never `null`.

### GET /api/questions/{id}

The question's `question.md`, read from disk per request, so editing a
question needs no restart.

```json
{"id": "q01", "instance": "instance-1", "domain": "Application Environment, Configuration and Security", "markdown": "..."}
```

For an mcq exam the response instead carries the choices — never the
answer key, which reaches the client only inside graded results
(`facilitator/internal/api/api.go:217-221`):

```json
{"id": "q01", "domain": "Kubernetes Fundamentals", "markdown": "...", "options": ["...", "...", "...", "..."], "multi": false}
```

| Code | When |
|---|---|
| 200 | `id` names a question in the loaded exam. |
| 404 | It does not (`facilitator/internal/api/api.go:229`). |
| 500 | `question.md` could not be read (`facilitator/internal/api/api.go:235`). |

### GET /api/questions/{id}/solution

The question's `solution.md`. Gated — see
[Session-state gates](#session-state-gates).

```json
{"id": "q01", "markdown": "..."}
```

| Code | When |
|---|---|
| 200 | Gate open, `id` known. |
| 403 | Gate closed (`facilitator/internal/api/api.go:265-267`). |
| 404 | Gate open, unknown `id` (`facilitator/internal/api/api.go:271-273`). |
| 500 | `solution.md` could not be read (`facilitator/internal/api/api.go:277-280`). |

The gate is checked before the id is looked up, so the endpoint cannot
be used to discover which question ids exist.

In an mcq bank `solution.md` is the question's explanation (why the
correct answer is correct and why each distractor is wrong); the same
gate applies unchanged.

### GET /api/questions/{id}/hints/{n}

One hint tier, 1-based, so revealing the second is a deliberate act
rather than something the client silently already holds. `n` ranges
over the `hintCount` reported by `GET /api/exam`.

```json
{"id": "q01", "tier": 1, "total": 2, "markdown": "..."}
```

| Code | When |
|---|---|
| 200 | Training attempt, known `id`, `n` in range. |
| 403 | Not a training attempt, or no attempt at all (`facilitator/internal/api/api.go:323-328`). |
| 404 | Unknown `id`, or `n` outside 1..`hintCount` (`facilitator/internal/api/api.go:334-351`). |
| 500 | `hints.md` could not be read (`facilitator/internal/api/api.go:346`). |

The route is registered unconditionally, so the difference between 404
and 403 never leaks the attempt's mode.

### PUT /api/questions/{id}/answer

Records the candidate's selection for one mcq question: an idempotent
upsert the UI issues on every option click. `selected` holds 0-based
indices into the question's `options`; an empty array means
"deselected everything" and deletes the stored entry. The response
echoes the stored (sorted) selection.

```json
{"selected": [0, 2]}
```

```json
{"id": "q07", "selected": [0, 2]}
```

| Code | When |
|---|---|
| 200 | Stored (`facilitator/internal/api/api.go:423`). |
| 400 | Not an mcq exam, the body is not `{"selected":[...]}`, an index is out of range or duplicated, or more than one index on a single-answer question (`facilitator/internal/api/api.go:372-409`). |
| 404 | Unknown `id` (`facilitator/internal/api/api.go:383-386`). |
| 409 | No attempt is running (`facilitator/internal/api/api.go:376-379`, re-checked at the write: `:414-418`). |

The 409 is checked before the id lookup, matching the solution
handler's ordering. Selections are persisted in the session file
(format v4, `facilitator/internal/session/session.go`), so a page
reload — or a facilitator restart — resumes with every answer intact.

### GET /api/answers

Every stored selection, keyed by question id — the bulk read the UI
hydrates from on mount and the score review reads after grading.
Always 200; `{"answers":{}}` when idle or on a hands-on bank. Never
includes the answer key
(`facilitator/internal/api/api.go:435-437`).

```json
{"answers": {"q01": [1], "q07": [0, 2]}}
```

### POST /api/session/start

Starts an attempt. The body is optional and defaults to an exam
attempt, which is what `./sim` and `tests/smoke.sh` send.

```json
{"mode": "training"}
```

The response is the session shape documented under
[GET /api/session](#get-apisession).

| Code | When |
|---|---|
| 200 | Started (`facilitator/internal/api/api.go:531`). |
| 400 | `mode` is not `exam`, `training` or `speed` (`facilitator/internal/api/api.go:522`). |
| 409 | The environment is still starting (`facilitator/internal/api/api.go:507-510`), or a session is already running or ended (`facilitator/internal/api/api.go:528`). |

The readiness gate is what stops a 120-minute clock starting against a
half-built environment: the facilitator answers long before the cluster
is usable. **An mcq exam skips the readiness gate** — it needs no
cluster, no instances and no desktop, so the attempt starts the moment
the facilitator can answer, while the environment finishes booting in
the background (`facilitator/internal/api/api.go:503-510`).

### GET /api/session

Current session state. Always 200
(`facilitator/internal/api/api.go:551`).

```json
{
  "state": "running",
  "bank": "ckad-mock-01",
  "startedAt": "2026-07-28T09:20:11.402861Z",
  "durationSeconds": 7200,
  "remainingSeconds": 6841,
  "endReason": "",
  "mode": "exam",
  "untimed": false
}
```

`endReason` is `""`, `submitted` or `expired`. `startedAt` is RFC 3339
with nanoseconds, or `""` when the session has never started. Branch on
`untimed`, not on `remainingSeconds == 0` — an expired attempt reports
0 too (`facilitator/internal/session/session.go:105-108`).

### POST /api/session/end

Ends a running attempt as `submitted` and kicks grading in the
background; the desktop locks immediately. No body.

| Code | When |
|---|---|
| 202 | Ended; the body is the session shape (`facilitator/internal/api/api.go:562`). |
| 409 | The session is idle, or already ended with results recorded (`facilitator/internal/api/api.go:555-558`). |

Re-POSTing on an ended-but-ungraded session succeeds as a no-op and
retries the grade (`facilitator/internal/session/session.go:331-335`).

### POST /api/session/grade

Scores the environment as it stands, without ending the attempt and
without recording anything. Training only, no body. The 200 body is the
same shape as `GET /api/results`.

| Code | When |
|---|---|
| 200 | Graded (`facilitator/internal/api/api.go:461-464`). |
| 403 | Not a training attempt (`facilitator/internal/api/api.go:445`). |
| 409 | No attempt is running (`facilitator/internal/api/api.go:449`), or a grading run is already in flight (`facilitator/internal/api/api.go:459`). |
| 501 | This build has no practice grader wired (`facilitator/internal/api/api.go:453`). |

The score is never persisted, so `GET /api/results` still answers 409
afterwards — `tests/smoke.sh:573` pins that.

### GET /api/results

The graded scoreboard for the ended attempt.

| Code | When |
|---|---|
| 200 | Grading finished (`facilitator/internal/api/api.go:597-601`). |
| 202 | Ended, still grading: `{"state":"grading"}` (`facilitator/internal/api/api.go:586`). |
| 409 | The session has not ended (`facilitator/internal/api/api.go:581`). |
| 500 | Grading failed; the body carries the error (`facilitator/internal/api/api.go:591`). |

```json
{
  "bank": "ckad-mock-01",
  "gradedAt": "2026-07-28T11:20:44.913482Z",
  "earned": 128,
  "total": 180,
  "percent": 71,
  "passingScore": 66,
  "passed": true,
  "questions": [
    {
      "id": "q01",
      "instance": "instance-1",
      "domain": "Application Environment, Configuration and Security",
      "earned": 3,
      "total": 9,
      "checks": [
        {"name": "10_list-file.sh", "desc": "/opt/course/1/aurora-namespaces lists team=aurora namespaces, sorted, names only", "points": 3, "earned": 3, "passed": true, "message": ""},
        {"name": "20_namespace.sh", "desc": "Namespace aurora-staging exists with label team=aurora", "points": 2, "earned": 0, "passed": false, "message": "label team=aurora not found"}
      ]
    }
  ]
}
```

Abridged: `questions` carries every question in the bank and `checks`
every check in each. `percent` is integer `earned * 100 / total`, and
`passed` is `percent >= passingScore`
(`facilitator/internal/evaluate/evaluate.go:169-171`).

An mcq attempt is graded from the session's stored answers
(`facilitator/internal/mcqgrade/mcqgrade.go`), all-or-nothing per
question, into the same schema: each question carries one synthetic
`answer` check plus four mcq-only review fields —

```json
{
  "id": "q07",
  "instance": "",
  "domain": "Container Orchestration",
  "earned": 0,
  "total": 1,
  "checks": [
    {"name": "answer", "desc": "Correct answer selected", "points": 1, "earned": 0, "passed": false, "message": "selected A — correct A, D"}
  ],
  "selected": [0],
  "correct": [0, 3],
  "options": ["...", "...", "...", "..."],
  "multi": true
}
```

`selected` is absent when the question was never answered. This is the
only place the answer key ever reaches the client
(`facilitator/internal/evaluate/evaluate.go:119-135`).

### DELETE /api/session

Returns the session to idle from any state, clearing results, and locks
the desktop. The conductor calls it as the first phase of every reset
and switch (`conductor/internal/control/control.go:339-356`).

| Code | When |
|---|---|
| 204 | Reset, from any state (`facilitator/internal/api/api.go:571`). |
| 500 | The reset could not be persisted (`facilitator/internal/api/api.go:567`). |

### /desktop and /desktop/

Reverse proxy to the noVNC desktop container, same-origin so the exam
UI can iframe it.

| Code | When |
|---|---|
| 308 | Exactly `/desktop`, redirected to `/desktop/` with the query string preserved, in any state (`facilitator/internal/desktop/proxy.go:56-58`). |
| 403 | No attempt is running. A small dark HTML page for the desktop root and any `*.html`, `text/plain` for every other path (`facilitator/internal/desktop/proxy.go:97-107`). |

While locked the backend is never dialled at all. While unlocked every
request is proxied, including noVNC's WebSocket upgrade.

### /api/control/

Proxied to the conductor with the path unstripped — the conductor's own
mux registers the same paths. See [Conductor](#conductor).

### Everything else

Any path that is not `/api/*` or `/desktop*` serves the embedded UI:
the real file when one exists, otherwise `index.html`, so client-side
routes such as `/score` load. An unmatched path under `/api/` is a JSON
404, never `index.html`
(`facilitator/internal/api/api.go:609-613`).

## Conductor

Reachable only through the facilitator's `/api/control/` proxy, on the
same `:8080` origin as everything else. `GET /healthz` is the one
exception: it answers 200 `ok`
(`conductor/internal/api/api.go:34-36`) but sits outside the
`/api/control/` prefix, so only the container's own healthcheck reaches
it.

### GET /api/control/status

The single in-flight control job and the last finished one. Always 200.

```json
{
  "busy": true,
  "job": {
    "id": "job-1",
    "op": "reset",
    "bank": "",
    "startedAt": "2026-07-28T11:04:02.117Z",
    "phase": "recreate-cluster",
    "phases": [
      {"id": "end-session", "label": "End session and lock desktop", "state": "done", "startedAt": "...", "finishedAt": "..."},
      {"id": "recreate-cluster", "label": "Recreate Kubernetes cluster", "state": "running", "startedAt": "...", "detail": "Preparing nodes"}
    ]
  }
}
```

`op` is `reset` or `switch`; `bank` is a switch's target and `""` for a
reset. A phase `state` is `pending`, `running`, `done` or `failed`, and
`detail` is a one-line tail of that phase's command output capped at
160 bytes (`conductor/internal/control/control.go:418-420`). A failed
job carries `error` and keeps the failed phase in `lastJob`. `job` and
`lastJob` are omitted while unset.

`./sim reset` polls `busy` and then reads `lastJob.error`
(`sim:107-114`).

### POST /api/control/reset

Rebuilds the environment on the current bank. No body. Asynchronous:
poll `/api/control/status`. Five phases — end-session, wipe-instances,
recreate-cluster, restart-instances, verify
(`conductor/internal/control/control.go:109-117`).

| Code | When |
|---|---|
| 202 | Job accepted; the body is `{"job": {...}}` (`conductor/internal/api/api.go:48`). |
| 409 | Another control operation is in flight (`conductor/internal/api/api.go:92-93`). |
| 500 | The job could not be started (`conductor/internal/api/api.go:105`). |

Reset has no session guard by design: it *is* the "abandon this
attempt" operation (`conductor/internal/control/control.go:26-30`).

### POST /api/control/reseed

Re-runs one question's `setup.sh`, restoring that question's starting
state and discarding the work done on it. Synchronous, and bounded at
240s (`conductor/internal/control/reseed.go:41`) — it returns an
outcome rather than a job id, and never takes the single-job lock a
rebuild needs.

```json
{"question": "q01"}
```

| Code | When |
|---|---|
| 200 | `{"ok": true}` (`conductor/internal/api/api.go:63`). |
| 400 | The body has no non-empty `question` (`conductor/internal/api/api.go:56`), or the id fails the `^q[0-9]{1,3}$` shape check or the active bank's question allowlist (`conductor/internal/control/reseed.go:60-75`). |
| 403 | The attempt is not a running Training attempt (`conductor/internal/control/reseed.go:83-89`). |
| 409 | A control job is in flight (`conductor/internal/control/reseed.go:79-81`), or another re-seed is running (`conductor/internal/control/reseed.go:91-93`). |
| 500 | `setup.sh` exited non-zero, or the session state could not be read. |

The id passes two gates because it ends up inside a shell command: the
pattern says it is well-formed, the catalog says it is real.

### GET /api/control/banks

The exam catalog the lobby renders. Always 200.

```json
{
  "active": "ckad-mock-01",
  "banks": [
    {"id": "ckad-mock-01", "title": "CKAD Mock Exam 01", "certification": "CKAD", "description": "Developer-track exercises...", "examType": "hands-on", "durationSeconds": 7200, "passingScore": 66, "kubernetesVersion": "1.35", "questionCount": 22, "available": true},
    {"id": "kcna-mock", "title": "KCNA Mock Exam", "certification": "KCNA", "examType": "mcq", "available": false, "comingSoon": true, "note": "Multiple-choice engine not built yet"}
  ]
}
```

`active` is read from `/shared/bank` at call time, so it is correct the
instant a switch rewrites it. `available` is false for a coming-soon
entry, a non-`hands-on` exam type, or a bank whose topology does not
fit the fixed `instance-1`/`instance-2` layout; `note` gives the reason
(`conductor/internal/catalog/catalog.go:187-210`).

### POST /api/control/switch

Activates a different bank: writes `/shared/bank`, rebuilds the
cluster, restarts the instances and then the bank-reading services,
facilitator last. Asynchronous. Seven phases — reset's five plus
`write-bank` before the rebuild and `restart-facilitator` after the
instances (`conductor/internal/control/control.go:172-186`).

```json
{"bank": "ckad-mock-01"}
```

| Code | When |
|---|---|
| 202 | Job accepted; the body is `{"job": {...}}` (`conductor/internal/api/api.go:83`). |
| 400 | The body has no non-empty `bank` (`conductor/internal/api/api.go:75`), or the bank is unknown, malformed or not runnable (`conductor/internal/api/api.go:97`). |
| 409 | An attempt is running — end it first (`conductor/internal/api/api.go:95`) — or another control operation is in flight (`conductor/internal/api/api.go:93`). |
| 500 | Switching is not configured on this conductor (`conductor/internal/control/control.go:192-194`). |
