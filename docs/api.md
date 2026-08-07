# HTTP API

**There is no authentication on any endpoint of the simulator.** Anyone
who can reach the port has every capability the exam UI has — see
[SECURITY.md](../SECURITY.md).

That property survives a hosted deployment rather than being weakened by
it. The hub, documented at the end of this page, is a separate process
in front, and the facilitator is never reachable except through it.

Two services in the simulator, plus a third only in a hosted deployment
([hosting.md](hosting.md)).

| Service | Reachable on |
|---|---|
| Facilitator | Port 8080. Serves the API, the embedded UI, the desktop proxy, and a reverse proxy to the conductor |
| Conductor | Only through that proxy |
| Hub | Hosted deployments only |

How the conductor listens:

| Shape | Address |
|---|---|
| Compose | `:9000` on an `internal: true` network, no host port |
| Hosted Pod | A unix socket in a volume mounted into the facilitator and nothing else |

A Pod is one network namespace, so an internal network is not available
there. One value per side describes either shape — `LISTEN` and
`CONDUCTOR_ADDR`, each a `host:port` or a `unix:/path`.

Host ports are in [cli.md](cli.md).

Errors are `{"error":"..."}` as `application/json`
(`facilitator/internal/api/api.go`,
`conductor/internal/api/api.go`). Both `/healthz` endpoints answer
in plain text, and the desktop's locked responses in HTML or plain
text.

## Attempt modes

Mode is chosen at `POST /api/session/start` and is immutable for the
life of the attempt. Every gate below reads server-side session state,
never a request field
(`facilitator/internal/session/session.go`).

The wire id and the displayed name are not the same word for `speed`.
The UI calls it **Mastery**; the id stays `speed` because renaming it
would invalidate every persisted session and every stored attempt.

| Mode | Shown as | Clock | Hints | Solutions while running | Score mid-attempt | Re-seed a question |
|---|---|---|---|---|---|---|
| `training` | Training | Untimed | Yes | Yes | Yes | Yes |
| `speed` | Mastery | `spec.speedDuration`, or half the bank's duration | No | No | No | No |
| `exam` | Exam | The bank's `spec.duration` | No | No | No | No |

The three columns after the clock are not restated per handler: they are
`session.HelpAllowed`, `session.GradesPerTask` and `session.Recorded`
(`facilitator/internal/session/session.go`), which both the gates
below and the `modes` array in `GET /api/exam` read.

## Session-state gates

Session state is `idle`, `running` or `ended`. An idle session reports
its mode as the empty string
(`facilitator/internal/session/session.go`), which is what
closes every mode-based gate below while idle.

| Gate | Open when | Closed response | Source |
|---|---|---|---|
| Solutions | `state == "ended"`, **or** `HelpAllowed(mode)` | 403 | `facilitator/internal/api/api.go` |
| Hints | `HelpAllowed(mode)` and `state != "idle"` | 403 | `facilitator/internal/api/api.go` |
| Mid-attempt score | `GradesPerTask(mode)` and `state == "running"` | 403 on mode, 409 on state | `facilitator/internal/api/api.go` |
| Answer writes (mcq) | `state == "running"` | 409 | `facilitator/internal/api/api.go` |
| Focus reports | `state == "running"` | 409 | `facilitator/internal/api/api.go` |
| Desktop | `state == "running"`, any mode | 403 | `facilitator/cmd/facilitator/main.go` |
| Re-seed | `mode == "training"` and `state == "running"` | 403 | `conductor/internal/control/reseed.go` |
| Seed | `state != "running"` | 409 | `conductor/internal/control/seed.go` |
| Bank switch | `state != "running"` | 409 | `conductor/internal/control/control.go` |
| Reset | Always open | — | `conductor/internal/control/control.go` |

**The solutions gate is not "403 until the session has ended".** The
condition is `snap.State != "ended" && snap.Mode != session.ModeTraining`,
so a *running* Training attempt gets 200 — `tests/smoke.sh`
asserts exactly that. A running `exam` or `speed` attempt gets 403, and so
does an idle session, whose mode is empty whatever the last attempt
was.

None of these gates is a security control. Every `solution.md` and
`hints.md` sits unencrypted in `banks/` on your own disk throughout.

## The device gate

A hands-on attempt is a question panel beside a live Linux desktop over
VNC. It needs a physical keyboard and room for two panes, so a touch-only
client is refused one — by the hub before a seat is claimed, and by the
facilitator before a clock starts.

| Header | Values | Sent by |
|---|---|---|
| `X-Sim-Pointer` | `coarse` (no precise pointer anywhere) or `fine` | every SPA request, from `ui/src/lib/deviceCapability.ts` |

**The client measures and declares; the server decides.**

This inverts the mode-capability pattern, where the server owns the
predicate and the client only renders it. The cause:

- No server can observe a pointer type.
- A `User-Agent` is a string the browser chooses. Desktop mode on a
  phone walks straight through one, and some laptops are turned away by
  it.

| Request | Refused when | Response |
|---|---|---|
| `POST /api/session/start` (hub) | the resolved kind is `practical` | 409 `{"code": "desktop_required", "error": "…"}`, **before** a seat is claimed or a queue place taken |
| `POST /api/control/switch` (hub) | the named bank's engine is hands-on | the same 409, before a two-to-four minute rebuild |
| `POST /api/session/start` (facilitator) | the loaded exam is not `mcq` | the same 409, beside the readiness gate. This is the backstop every attempt passes through, local or hosted |

**An absent or unrecognised value admits.** `./sim`, `tests/smoke.sh` and
every `curl` POST send no header at all, and an older SPA sends none
either; all of them must keep working unchanged. Like the session-state
gates above, this is UX fidelity rather than security — it stops a mobile
browser starting an exam it cannot sit, and claims nothing stronger.

```console
$ curl -s -X POST localhost:8080/api/session/start \
    -H 'Content-Type: application/json' -H 'X-Sim-Pointer: coarse' \
    -d '{"mode":"exam"}'
{"code":"desktop_required","error":"this exam runs a Linux desktop beside the questions, so it needs a desktop browser and a keyboard"}
```

## Facilitator

### GET /healthz

Backs the compose healthcheck. Always 200, `text/plain`, body `ok`
(`facilitator/internal/api/api.go`).

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
(`facilitator/internal/api/api.go`). The `/shared/ready` marker
is the authority on readiness and overrides whatever the phase file
claims, in both directions
(`facilitator/internal/bootstate/bootstate.go`).

### GET /api/exam

The active bank's metadata, its question list, its curriculum domains,
and the three selectable modes. Always 200.

```json
{
  "name": "ckad-mock-01",
  "title": "CKAD Mock Exam 01",
  "certification": "CKAD",
  "examType": "hands-on",
  "durationSeconds": 7200,
  "passingScore": 66,
  "kubernetesVersion": "1.35",
  "questionCount": 22,
  "hasTips": true,
  "questions": [
    {"id": "q01", "instance": "instance-1", "domain": "Application Environment, Configuration and Security", "weight": 9, "totalPoints": 9, "hintCount": 2, "targetSeconds": 360, "targetDerived": true}
  ],
  "domains": [
    {"name": "Application Environment, Configuration and Security", "weightPct": 25, "questionCount": 6}
  ],
  "modes": [
    {"id": "training", "durationSeconds": 0, "untimed": true, "helpAllowed": true, "gradesPerTask": true, "recorded": false, "recommended": false},
    {"id": "speed", "durationSeconds": 3600, "untimed": false, "helpAllowed": false, "gradesPerTask": false, "recorded": true, "recommended": true},
    {"id": "exam", "durationSeconds": 7200, "untimed": false, "helpAllowed": false, "gradesPerTask": false, "recorded": true, "recommended": false}
  ]
}
```

`modes` is ordered gentlest-first — the order the mode screen offers the
cards in.

Every flag reads the same `facilitator/internal/session` predicate the
enforcing handler reads, so a described mode and an enforced one cannot
disagree:

| Field | Source |
|---|---|
| `helpAllowed` | `session.HelpAllowed` |
| `gradesPerTask` | `session.GradesPerTask` |
| `recorded` | `session.Recorded` |
| `durationSeconds` | The same `durationFor` that `POST /api/session/start` resolves the real clock with, including under `SESSION_DURATION_OVERRIDE` |

`recorded` says whether a finished attempt in that mode belongs in the
durable attempt history, and the recorder honours exactly this predicate
— see [Attempt history](#attempt-history). The promise on the card and
the rule in the recorder are one statement rather than two.
`recommended` marks the one card the mode screen accents; exactly one
mode carries it.

Mode **labels** are deliberately not in this response. A mode's name is
user-facing copy and lives in `ui/src/strings.ts`; its permissions are
facts only the server knows.

`certification` names the exam this bank rehearses ("CKAD"), where
`title` names the bank ("CKAD Mock Exam 01"). Omitted when the bank
declares none. The mode screen and its header read it from here rather
than from the conductor's catalog, so a deep link into that screen
needs no prior call to `GET /api/control/banks`.

`examType` is `hands-on` or `mcq` (`facilitator/internal/exam/exam.go`
normalizes an absent `spec.examType` to `hands-on`). For hands-on,
`totalPoints` sums the question's checks, excluding any whose
`# points:` header was malformed
(`facilitator/internal/api/api.go`). For mcq questions the
entry is `{"id", "domain", "weight", "totalPoints", "hintCount",
"multi"}` — no `instance`, `totalPoints` equals `weight`, and `multi`
marks a select-all-that-apply question. `questions` marshals as `[]`,
never `null`.

`targetSeconds` is how long the question is meant to take.

`targetDerived` says that figure was **computed**, not authored — the
question's weight's share of the bank's clock, which is what a bank
setting no `spec.questions[].targetSeconds` gets.

- Neither shipped bank sets one, so both are derived today.
- The flag exists because the two are different claims: an author's
  judgement of the work, versus arithmetic about weights. A display that
  cannot tell them apart states the second with the first's confidence.
- **It is a budget, never a limit.** Nothing enforces it, and running
  over costs no points.

Two things to know about the arithmetic:

- **The divisor is the weight one attempt carries, not the pool's.**
  kcna-mock's 90 minutes spread across the 65 questions a candidate
  gets, not the 97 the bank authors — so a question is 83 seconds, not
  56.
- **The clock is the bank's declared `spec.duration`, whatever the
  attempt's mode is.** An untimed Training attempt has no clock to
  divide, and its pacing budget is the exam it is practice for.

`domains` is the bank's curriculum in declaration order — the list a
draw configurator builds its chips from.

| Field | Means |
|---|---|
| `weightPct` | The domain's `spec.domainWeights` entry: what it is worth in the real certification. `0` for a bank that publishes none |
| `questionCount` | How many questions this bank has in it |

The two are independent. A domain can be worth 44% and hold three
questions.

**`domains` is always counted over the full pool**, while `questions`
above is narrowed to the drawn subset once an attempt starts
(`facilitator/internal/api/api.go`). Counting `questions` by
domain instead would show a candidate the questions they already drew as
if they were the whole curriculum. `questionCount` is the exam's declared
length — `spec.examLength` for a pooled bank, otherwise the pool size —
and is what any display of "how many questions" must read, since
`questions` still lists the whole pool before an attempt has drawn.

`hasTips` says the bank ships a `tips.md`, i.e. that
[`GET /api/exam/tips`](#get-apiexamtips) has something to serve. Omitted
when it does not; the client draws no entry point at all in that case,
because a control that opens an empty sheet is worse than none.

### GET /api/exam/tips

The active bank's `tips.md` — how to sit *this* exam quickly, read from
disk per request so editing it needs no restart.

```json
{"markdown": "# Exam tips\n\n..."}
```

**Ungated, deliberately**, where
[`/solution`](#get-apiquestionsidsolution) and
[`/hints/{n}`](#get-apiquestionsidhintsn) are not. Those two carry
answers, which is what an exam exists to withhold; this carries technique
— aliases, generators, `kubectl explain`, where to look when a Pod will
not start — which is the same advice before, during and after an attempt
and is most useful before one. No mode is consulted and no attempt need
exist.

| Code | When |
|---|---|
| 200 | The bank ships a `tips.md`. |
| 404 | It does not. Ask `hasTips` on `GET /api/exam` first; this is the honest answer for anything that asks anyway. |
| 503 | No exam is loaded — the shell is up and nothing has been chosen (`facilitator/internal/api/history.go`, `requireExam`). |

### GET /api/questions/{id}

The question's `question.md`, read from disk per request, so editing a
question needs no restart.

```json
{"id": "q01", "instance": "instance-1", "domain": "Application Environment, Configuration and Security", "markdown": "..."}
```

For an mcq exam the response instead carries the choices — never the
answer key, which reaches the client only inside graded results
(`facilitator/internal/api/api.go`):

```json
{"id": "q01", "domain": "Kubernetes Fundamentals", "markdown": "...", "options": ["...", "...", "...", "..."], "multi": false}
```

| Code | When |
|---|---|
| 200 | `id` names a question in the loaded exam. |
| 404 | It does not (`facilitator/internal/api/api.go`). |
| 500 | `question.md` could not be read (`facilitator/internal/api/api.go`). |

### GET /api/questions/{id}/solution

The question's `solution.md`. Gated — see
[Session-state gates](#session-state-gates).

```json
{
  "id": "q08",
  "markdown": "...",
  "docs": [
    {"label": "Ingress", "url": "https://kubernetes.io/docs/concepts/services-networking/ingress/"}
  ]
}
```

`docs` is `spec.questions[].docs` from the bank, omitted entirely when
the question declares none — which most do.

- Rendered as the explanation screen's footer, opening in the
  candidate's own browser.
- These links never reach the exam desktop, which browses through the
  allowlist proxy and never sees this endpoint.
- An entry whose URL is not `https`, or does not parse, is dropped at
  bank load with a log line rather than failing the boot. A mistyped
  study link must not stop someone sitting an exam.

| Code | When |
|---|---|
| 200 | Gate open, `id` known. |
| 403 | Gate closed (`facilitator/internal/api/api.go`). |
| 404 | Gate open, unknown `id` (`facilitator/internal/api/api.go`). |
| 500 | `solution.md` could not be read (`facilitator/internal/api/api.go`). |

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
| 403 | Not a training attempt, or no attempt at all (`facilitator/internal/api/api.go`). |
| 404 | Unknown `id`, or `n` outside 1..`hintCount` (`facilitator/internal/api/api.go`). |
| 500 | `hints.md` could not be read (`facilitator/internal/api/api.go`). |

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
| 200 | Stored (`facilitator/internal/api/api.go`). |
| 400 | Not an mcq exam, the body is not `{"selected":[...]}`, an index is out of range or duplicated, or more than one index on a single-answer question (`facilitator/internal/api/api.go`). |
| 404 | Unknown `id` (`facilitator/internal/api/api.go`). |
| 409 | No attempt is running (`facilitator/internal/api/api.go`, re-checked at the write: `:616-620`). |

The 409 is checked before the id lookup, matching the solution
handler's ordering. Selections are persisted in the session file
(format v6, `facilitator/internal/session/session.go`), so a page
reload — or a facilitator restart — resumes with every answer intact.

### GET /api/answers

Every stored selection, keyed by question id — the bulk read the UI
hydrates from on mount and the score review reads after grading.
Always 200; `{"answers":{}}` when idle or on a hands-on bank. Never
includes the answer key
(`facilitator/internal/api/api.go`).

```json
{"answers": {"q01": [1], "q07": [0, 2]}}
```

### POST /api/session/start

Starts an attempt. **The body and every field in it are optional**; an
empty body is a whole-curriculum exam attempt under a freshly minted
seed, which is what `./sim` and `tests/smoke.sh` send — they POST with
no body at all and no `Content-Type`.

```json
{"mode": "training", "seed": "a1b2c3", "domains": ["Kubernetes Fundamentals"], "poolDigest": "3f9c1a2b7e04"}
```

The response is the session shape documented under
[GET /api/session](#get-apisession), plus `"poolChanged": true` when the
supplied `poolDigest` does not match the loaded bank's — see below. That
one field appears here and nowhere else.

| Code | When |
|---|---|
| 200 | Started. The clock is running. |
| 202 | **Drawn, not started** — a pooled hands-on bank only. The cluster is being prepared for the questions just drawn and the clock has not begun. See [Preparing an attempt](#preparing-an-attempt). |
| 400 | `mode` is not `exam`, `training` or `speed`; the body is non-empty and not JSON; `seed` is not six lowercase hex digits, or `domains` names a domain the bank does not have. |
| 409 | The environment is still starting; the caller declared a coarse pointer and this is not an mcq exam (`code: "desktop_required"` — see [The device gate](#the-device-gate)); a session is already running or ended; a preparation is already in flight; the conductor refused or could not be reached (the body carries its own words); or — pooled hands-on only — **the cluster is still holding a different draw's objects**. |
| 500 | The bank's pool cannot satisfy its own `domainWeights` at this draw size — an authoring bug `tests/bank-weights.sh` should have caught first. |
| 503 | This build has no route to the conductor, so a pooled hands-on bank's cluster cannot be prepared. |

The readiness gate is what stops a 120-minute clock starting against a
half-built environment: the facilitator answers long before the cluster
is usable. **An mcq exam skips the readiness gate** — it needs no
cluster, no instances and no desktop, so the attempt starts the moment
the facilitator can answer, while the environment finishes booting in
the background (`facilitator/internal/api/api.go`).

### Preparing an attempt

Only a **pooled hands-on bank** produces this, and no bank in this repo is
one — every bank here takes the 200 path. It exists because such a bank's
cluster is deliberately empty at boot: the draw decides what to seed, so
seeding cannot happen until the draw has.

Two reference implementations handle it, and both are exercised only by
the branch being dormant: `startSession` plus the poller in
`ui/src/App.tsx`, and `start_session` in `tests/smoke.sh`. A client that
branches on the body's shape instead of the status code will pass every
test in this repo and break on the first bank that pools.

The 202 body is a preparation, not a session:

```json
{"state": "preparing", "bank": "ckad-mock-01", "mode": "exam", "jobId": "job-7",
 "questionCount": 16, "seed": "a1b2c3", "poolDigest": "0f1e2d3c4b5a",
 "domainFilter": ["Services and Networking"], "poolChanged": true}
```

`domainFilter` is omitted for a whole-curriculum draw and `poolChanged`
when false. **Branch on the status code, not the body's shape**: 202 also
passes an `ok` check, and read as a session it looks like an attempt in
state `preparing` with a zero clock.

Meanwhile `GET /api/session` reports `state: "idle"` with two extra
fields — `preparing` (`jobId`, `mode`, `questionCount`, `startedAt`,
`seed`, `poolDigest`) and, after a failure, `prepareError`. `state` stays
a strict three-way on purpose: a client that has never heard of pooling
keeps reading a response that is true, and `DELETE /api/session` still
cancels.

**The terminal condition is `preparing` disappearing from
`GET /api/session`. It is not `controlStatus.busy` going false.** The seed
job settles in the conductor up to a poll before the facilitator starts
the clock; a watcher keyed on the job sees `idle` inside that window and
sends the candidate back to the lobby with their exam already running. The
server starts the session first and clears `preparing` second, so a reader
watching that field never observes a moment with neither.

While it is present, `GET /api/control/status` reports an ordinary job
with `op: "seed"` and one phase, `seed-questions`, whose `detail` counts
`question N of M`; `GET /api/control/log` carries the `setup.sh` output.
When `preparing` goes:

- `state: "running"` — the attempt is the draw that was seeded, same seed
  and same ids. Route into it.
- `state: "idle"` with `prepareError` — show it and stay put. No clock
  ever started, so nothing was lost.
- `state: "idle"` with no `prepareError` — cancelled. Return to the lobby
  silently; this is not an error.

**`prepareError` can also arrive without this process ever having
prepared anything.** A preparation lives in memory, so a facilitator that
restarts mid-preparation loses the draw entirely and cannot resume it —
there is nothing left to start. On its first `GET /api/session`, a pooled
hands-on server asks the conductor whether its last job was a `seed`; an
idle session plus a seed job means the seeding was done for an attempt
that no longer exists, because a preparation that had *succeeded* would
have started an attempt, and an attempt is persisted. It then says so
rather than leaving a poller waiting forever, and the next
`POST /api/session/start` is refused 409 until the environment is reset —
the cluster is holding a draw nothing can now enumerate.

`DELETE /api/session` cancels and guarantees no attempt starts. It cannot
stop the conductor's job, so the overlay runs to completion — harmless,
because `setup.sh` is an idempotent apply.

### The draw

Every attempt draws, on both engines
(`facilitator/internal/exam/exam.go`, `Draw`).

`seed` replays a previous draw: six lowercase hex digits.

- Omitted, the server mints one. **Every attempt is replayable after the
  fact**, not only if the candidate thought to ask in advance.
- The seed comes back on the response and on every `GET /api/session`.
- A malformed seed is a `400`, never a silent reseed. Someone who
  mistypes the seed they meant to replay must be told, not handed a
  different exam that looks like the one they asked for.

The randomness is a keyed SHA-256 counter stream driving a Fisher-Yates
shuffle. Deliberately neither:

- `math/rand` — how much of its stream a shuffle consumes is not a
  stability guarantee across Go releases, so a toolchain upgrade could
  renumber every saved draw.
- `crypto/rand` — unseedable.

Stratification is unchanged: each domain contributes exactly its
`domainWeights` share of the draw length by largest-remainder rounding,
so a candidate's set matches the published curriculum every time, not
merely on average.

`domains` narrows the draw to part of the curriculum, and applies to
**both engines**.

- Narrowing a hands-on attempt is free and correct: `bootstrap.sh` seeds
  every question in the bank into the cluster at boot whatever the draw
  is, so a filtered attempt sees an identical cluster.
- Length pooling stays mcq-only.
- Within a filtered draw the remaining domains' weights are
  renormalized. Two domains of 44 and 28 divide a 10-question draw 6/4.
- **Naming every domain is recorded as no filter at all.** A
  full-coverage attempt — the only kind a "passed" claim rests on — must
  not look narrowed for the rest of its life.

`poolDigest` fingerprints the pool a seed came from: every question's id
and domain, in bank order, hashed to twelve hex characters.

| Changes when | Does not change when |
|---|---|
| A question is added, removed, renamed or re-domained — anything that changes what a draw would produce | A `question.md` is reworded, or an option's typo is fixed |

**A mismatched `poolDigest` does not refuse the start.** The draw is
still perfectly deterministic; it is simply no longer the same set. The
attempt begins and the response says `"poolChanged": true`, which is a
fact about *this request* rather than about the attempt, so it is not
persisted and never appears on `GET /api/session`. Refusing would leave
a candidate replaying an old seed with nothing at all instead of with a
comparable attempt and a warning.

The same digest has a second, harder job on the way out — see
[GET /api/results](#get-apiresults).

### PUT /api/session/focus

Tells the server which task is on screen. The client reports a question
id and nothing else; the server owns this clock exactly as it owns the
countdown, so a client cannot inflate how long it spent anywhere.

```json
{"question": "q07"}
```

```json
{"ok": true}
```

| Code | When |
|---|---|
| 200 | Recorded (`facilitator/internal/api/api.go`). |
| 400 | The body is not JSON, or `question` is empty (`facilitator/internal/api/api.go`). |
| 404 | `question` is outside this attempt's drawn subset (`facilitator/internal/api/api.go`). |
| 409 | No attempt is running (`facilitator/internal/api/api.go`). |

Time accrues to the **previously** reported question when a new report
arrives, so the first report of an attempt credits nothing and the
report that moves to another question is what closes the interval. Ending
the attempt closes the last one, which on the question a candidate
submitted from is the only interval it ever had.

The UI rides its existing 10-second session poller, so the resolution is
coarse by design and a lost report costs at most one interval.
Re-reporting the same question is the normal case and is how time
accumulates.

**A single gap contributes at most 90 seconds**, however long it really
was (`facilitator/internal/session/session.go`, `FocusGapCap`): a
candidate who closes the tab overnight is credited with a minute and a
half, not nine hours. For the same reason the open interval is not
persisted — the accrued totals survive a restart, but the stretch during
which the facilitator was down is the one span the candidate certainly
was not reading the question.

The 404 uses the same subset lookup every other single-question endpoint
does: time cannot have been spent on a pool question this attempt never
contained.

The totals reach the client only on `GET /api/results`, as each
question's `timeSpentSeconds`.

### GET /api/session

Current session state. Always 200
(`facilitator/internal/api/api.go`).

```json
{
  "state": "running",
  "bank": "ckad-mock-01",
  "startedAt": "2026-07-28T09:20:11.402861Z",
  "durationSeconds": 7200,
  "remainingSeconds": 6841,
  "elapsedSeconds": 359,
  "endReason": "",
  "mode": "exam",
  "untimed": false,
  "seed": "a1b2c3",
  "poolDigest": "3f9c1a2b7e04"
}
```

Two further fields appear only for a pooled hands-on bank, and only
between a draw and its clock: `preparing` and `prepareError`. Both are
described under [Preparing an attempt](#preparing-an-attempt); `state`
stays `idle` while `preparing` is set.

`endReason` is `""`, `submitted` or `expired`. `startedAt` is RFC 3339
with nanoseconds, or `""` when the session has never started. Branch on
`untimed`, not on `remainingSeconds == 0` — an expired attempt reports
0 too (`facilitator/internal/session/session.go`).

`elapsedSeconds` is how long the attempt has been running, frozen at its
length once it has ended. It exists because `durationSeconds -
remainingSeconds` is the elapsed time of a **timed** attempt only: an
untimed Training attempt reports both as 0, and nothing else in this
response can say how long it has been going.

`seed`, `poolDigest` and `domainFilter` are the draw's parameters,
persisted with the attempt. All three are omitted while idle, and on an
attempt started before seeding existed; `domainFilter` is also omitted
for a whole-curriculum attempt, which is what its absence means.

### POST /api/session/end

Ends a running attempt as `submitted` and kicks grading in the
background; the desktop locks immediately. No body.

| Code | When |
|---|---|
| 202 | Ended; the body is the session shape (`facilitator/internal/api/api.go`). |
| 409 | The session is idle, or already ended with results recorded (`facilitator/internal/api/api.go`). |

Re-POSTing on an ended-but-ungraded session succeeds as a no-op and
retries the grade (`facilitator/internal/session/session.go`).

### POST /api/session/grade

Scores the environment as it stands, without ending the attempt and
without recording anything. Training only, no body. The 200 body is the
same shape as `GET /api/results`.

| Code | When |
|---|---|
| 200 | Graded (`facilitator/internal/api/api.go`). |
| 403 | Not a training attempt (`facilitator/internal/api/api.go`). |
| 409 | No attempt is running (`facilitator/internal/api/api.go`), a grading run is already in flight, or the bank changed under the attempt (`facilitator/internal/api/api.go`, and see [Grading refuses on a changed bank](#grading-refuses-on-a-changed-bank)). |
| 501 | This build has no practice grader wired (`facilitator/internal/api/api.go`). |

The score is never persisted, so `GET /api/results` still answers 409
afterwards — `tests/smoke.sh` pins that.

### GET /api/results

The graded scoreboard for the ended attempt.

| Code | When |
|---|---|
| 200 | Grading finished (`facilitator/internal/api/api.go`). |
| 202 | Ended, still grading: `{"state":"grading"}` (`facilitator/internal/api/api.go`). |
| 409 | The session has not ended (`facilitator/internal/api/api.go`). |
| 500 | Grading failed, or refused; the body carries the reason (`facilitator/internal/api/api.go`). |

```json
{
  "bank": "ckad-mock-01",
  "gradedAt": "2026-07-28T11:20:44.913482Z",
  "earned": 128,
  "total": 180,
  "percent": 71,
  "pointsPercent": 71,
  "passingScore": 66,
  "passed": true,
  "mode": "exam",
  "seed": "a1b2c3",
  "durationSeconds": 7200,
  "elapsedSeconds": 6104,
  "questions": [
    {
      "id": "q01",
      "instance": "instance-1",
      "domain": "Application Environment, Configuration and Security",
      "earned": 3,
      "total": 9,
      "weightPct": 5,
      "verdict": "partial",
      "timeSpentSeconds": 412,
      "targetSeconds": 360,
      "checks": [
        {"name": "10_list-file.sh", "desc": "/opt/course/1/aurora-namespaces lists team=aurora namespaces, sorted, names only", "points": 3, "earned": 3, "passed": true, "message": ""},
        {"name": "20_namespace.sh", "desc": "Namespace aurora-staging exists with label team=aurora", "points": 2, "earned": 0, "passed": false, "message": "label team=aurora not found"}
      ]
    }
  ],
  "domains": [
    {"domain": "Application Environment, Configuration and Security", "earned": 30, "total": 45, "weightPct": 25, "questionCount": 5}
  ]
}
```

Abridged: `questions` carries every question the attempt was graded on
and `checks` every check in each. `passed` is `percent >= passingScore`.

### Weighting and the two percentages

`percent` is the **curriculum-weighted** score: each domain contributes
its `spec.domainWeights` share of the total, whatever the drawn
questions happened to be worth in points. `pointsPercent` is the raw
integer `earned * 100 / total` — what `percent` alone meant before
weighting existed. Both floor rather than round.

Weighting happens at scoring time rather than being baked into a bank's
point budget, because **a bank's points are fixed and a draw is not**.
`tests/bank-weights.sh` can promise ckad-mock-01's 217 points sit in the
curriculum's ratios, but not that a filtered or partial draw out of it
does.

| Attempt | The two numbers |
|---|---|
| Full-bank hands-on | Identical — the gate holds the points to the ratios the weights declare |
| Pooled | Differ by about a point. kcna-mock's 65-question draw is 29 Fundamentals questions: 44.6% of the points against a published weight of 44% |

Two rules keep the weighted number honest:

- Only the domains the attempt actually drew count. Their weights are
  renormalized to 100, so a draw covering half the curriculum still
  scores out of 100 rather than capping at 50.
- A bank that publishes no `spec.domainWeights` (or publishes them for
  only some of its domains) is weighted by points instead, which makes
  `percent` and `pointsPercent` equal. A missing weight is never read as
  a weight of zero.

`domains` is the per-domain rollup over the graded questions, in bank
order. Omitted when nothing was graded.

`weightPct`, on both a domain and a question, is that item's share of
`percent` in percentage points:

- A question's share is its domain's share, split across that domain's
  questions in proportion to their points.
- Question shares sum to 100.
- Neither is rounded.

`verdict` is exactly `correct`, `partial` or `failed`. A question with
no scorable points at all (every check's `# points:` header malformed)
reads as `failed`, not as a free `correct`.

### The attempt, carried on the result

`mode`, `seed`, `domainFilter`, `durationSeconds` and `elapsedSeconds`
are the attempt's own description, copied onto the result so a score can
be read without the session that produced it — which is what an attempt
history needs, and what the results banner already wants.
`durationSeconds` is 0 (hence absent) for an untimed attempt.

Per question, `timeSpentSeconds` is how long the task pane was open —
see [PUT /api/session/focus](#put-apisessionfocus) — and `targetSeconds`
repeats the pacing budget from `GET /api/exam` so the two can be
compared in one table.

`timeSpentSeconds` measures the **task pane, not attention**: a
candidate reading the question while thinking in a terminal accrues
time, and one who walked away accrues a capped amount of it too. Every
label built from it has to say "open", never "spent" or "worked".

`pointsPercent`, `weightPct`, `verdict`, `domains` and everything in
this section are **additive**.

- A result graded before they existed is persisted verbatim in the
  session file and served back unchanged after an upgrade. **A client
  must tolerate their absence.**
- This survives a session-format bump, which discards an in-flight
  *session*. A stored result is opaque bytes and outlives every one of
  them.

### Grading refuses on a changed bank

Grading fails with a 500 naming the mismatch when the attempt's
persisted `poolDigest` no longer fingerprints the loaded bank
(`facilitator/internal/exam/exam.go`, `CheckPool`).

`exam.Subset` silently skips ids the exam does not declare, which is
what lets "no subset drawn" mean "the whole bank".

The cost: a session whose drawn ids outlived the bank they came from
would otherwise be graded on the intersection and reported with a
plausible, confident, wrong `total` — a real-looking score for an exam
the candidate did not sit.

**A wrong score that looks right is worse than an error message**, so
the digest is checked before either engine runs.

This is not the same situation as `poolChanged` on
[POST /api/session/start](#post-apisessionstart), which is about a *new*
attempt replaying an old seed and is not an error at all.

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
  "weightPct": 1.5555555555555556,
  "verdict": "failed",
  "selected": [0],
  "correct": [0, 3],
  "options": ["...", "...", "...", "..."],
  "multi": true
}
```

`selected` is absent when the question was never answered. This is the
only place the answer key ever reaches the client
(`facilitator/internal/evaluate/evaluate.go`). Grading is
all-or-nothing, so an mcq `verdict` is only ever `correct` or `failed`,
never `partial`.

### DELETE /api/session

Returns the session to idle from any state, clearing results, and locks
the desktop. The conductor calls it as the first phase of every reset
and switch (`conductor/internal/control/control.go`).

| Code | When |
|---|---|
| 204 | Reset, from any state (`facilitator/internal/api/api.go`). |
| 500 | The reset could not be persisted (`facilitator/internal/api/api.go`). |

### Attempt history

Every endpoint below reads or writes `/state/history.json` on the
`state` volume — the one thing `./sim purge` does not destroy.

| Route | With no history store wired |
|---|---|
| The five `/api/history` routes | `503`. The route exists but has nowhere to write, which is a different fact from a `404` |
| `GET /api/catalog` | Degrades to empty progress. It still has a bank list to serve |

A record is written by the grader, once `SetResults` has succeeded, and
only for a **recorded** mode (`session.Recorded` — everything but
Training). A failure to record is logged and never propagated: a full
state volume must not turn a graded exam into a grading failure
(`facilitator/cmd/facilitator/grader.go`).

Records are **self-contained**. The certification, exam title, passing
score and domain rollup are copied in, never referenced. The dashboard
shows five certifications while only one bank is loadable at a time, so
a record that pointed at its bank would render as blanks for the other
four.

#### counted

`counted` is whether an attempt may set an exam's `bestPercent` or claim
its `passed`. Three clauses, each one a way the dashboard could
otherwise lie (`facilitator/internal/history/record.go`):

| Clause | Rejects |
|---|---|
| `session.Recorded(mode)` | Training — practice with the solutions open is not a sitting. Never fires on the recording path; it is there for an *imported* record, which came from a document this build did not write. |
| No `domainFilter` | A domain drill. 100% on a ten-task drill of one domain is a good session and is not a CKAD pass. |
| `questionCount >= the bank's declared length` | A short draw. Fewer questions is an easier exam, and a bank's passing score was set against its declared length. |

The flag is written once and then trusted — except that an *imported*
record came from a document this build did not write, and can claim
anything.

So every rollup re-checks the two clauses a record can verify about
**itself**:

1. Its mode.
2. Its domain filter.

A `counted` that contradicts either is ignored.

The length clause cannot be re-checked at read time and is not
attempted: a record's bank may not be the loaded one, which is the whole
point of a self-contained record.

An uncounted attempt is still **kept and shown** — it just does not move
the certification path. It also still contributes to `weakDomains`,
deliberately: a drill is the most informative thing a candidate can do
about a weak domain, and a rollup that ignored drills would keep
reporting the weakness they spent all week fixing.

`trackCount` is `5`: a constant of the CNCF **program** — KCNA, KCSA,
CKA, CKAD, CKS — not a count of the banks this build ships.

- Deriving it from the catalog would shrink the denominator to 1
  whenever the conductor is unreachable, and tell a candidate who passed
  CKAD that they were a Kubestronaut.
- `passedCount` counts distinct *track* certifications with a counted,
  passing attempt, so it can never exceed `trackCount`.

### GET /api/history

Every attempt, most recent first, plus the cross-exam summary. Always
200 (or 503).

```json
{
  "attempts": [
    {
      "id": "9f2c41ab30de5517",
      "bank": "ckad-mock-01",
      "certification": "CKAD",
      "examTitle": "CKAD Mock Exam 01",
      "examType": "hands-on",
      "mode": "exam",
      "startedAt": "2026-07-30T09:20:11Z",
      "gradedAt": "2026-07-30T11:20:44Z",
      "seed": "a1b2c3",
      "durationSeconds": 7200,
      "elapsedSeconds": 7233,
      "questionCount": 22,
      "earned": 41,
      "total": 60,
      "percent": 68,
      "pointsPercent": 68,
      "passingScore": 66,
      "passed": true,
      "counted": true,
      "domains": [
        {"domain": "Application Design and Build", "earned": 12, "total": 20, "weightPct": 20, "questionCount": 5}
      ]
    }
  ],
  "summary": {
    "attempts": 1,
    "passedCount": 1,
    "trackCount": 5,
    "weakDomains": [
      {"domain": "Services and Networking", "earned": 3, "total": 12, "percent": 25, "attempts": 1}
    ]
  }
}
```

| Field | Behaviour |
|---|---|
| `attempts` | Marshals as `[]`, never `null` |
| `id` | The session's own attempt token. This is what makes recording idempotent — a recovery re-grade of the same attempt updates nothing rather than showing the candidate the same sitting twice |
| `weakDomains` | Weakest first, ranked on **raw** points earned over points available |

`weakDomains` ranks a candidate's own domains against each other. How
much the exam board weights a domain is not part of that question.

### DELETE /api/history

Erases every attempt. 204, or 503. There is no undo and no server-side
backup, so the confirmation belongs to the caller — this handler does
exactly what it is asked.

### GET /api/history/summary

Just the `summary` object above, for a caller that wants the four
numbers without every record. Always 200 (or 503).

### GET /api/history/export

The record as a downloadable document, with
`Content-Disposition: attachment; filename="kubestronaut-sim-history-YYYY-MM-DD.json"`
so a plain `<a href>` saves a named file rather than rendering JSON in a
tab. The date is in the name because the one thing a candidate needs
from a folder of these is which is newest.

```json
{"version": 1, "attempts": [ ... ]}
```

The export is exactly what import accepts.

### POST /api/history/import

Merges an exported document into the record. The body is the document
itself; no `Content-Type` is required or checked.

```json
{"imported": 3, "skipped": 12}
```

| Code | When |
|---|---|
| 200 | Merged. |
| 400 | Not JSON, larger than 4 MiB, or a `version` newer than this build understands. |
| 500 | The merged record could not be written. |
| 503 | No history store. |

**Merge, never replace.** Records already present by `id` are skipped,
so importing a backup can never silently lose the attempts made since it
was taken, and importing the same file twice is a no-op. A record with
no `id` is skipped too: it cannot be de-duplicated, so importing it
would grow a duplicate on every import of the same file.

A `version` of 0 (a document written before the field existed, or a
saved `GET /api/history` body) is accepted — it is readable, so it is
read. A version from the future is refused rather than silently having
its unknown fields dropped, because the candidate is keeping that file
as their backup.

The same asymmetry governs loading. An unparseable or wrong-version
`history.json` is **renamed aside**, and a fresh record started:

- The new name is `history.json.corrupt.N`, picking a suffix that is
  free, so an earlier rescue is never clobbered.
- It is never removed and never truncated.

This is deliberately *not* the session file's
discard-on-version-mismatch policy. Discarding a session costs one
attempt; discarding history costs everything the candidate has ever
done.

### GET /api/catalog

The conductor's bank list joined to attempt history — the exam
selector's one call. Always 200 (503 is impossible here: a build with no
history still has a bank list).

```json
{
  "active": "ckad-mock-01",
  "exams": [
    {
      "id": "ckad-mock-01",
      "title": "CKAD Mock Exam 01",
      "certification": "CKAD",
      "examType": "hands-on",
      "durationSeconds": 7200,
      "passingScore": 66,
      "questionCount": 22,
      "poolCount": 26,
      "available": true,
      "progress": {
        "attempts": 3,
        "counted": 2,
        "bestPercent": 71,
        "passed": true,
        "lastAttemptAt": "2026-07-30T11:20:44Z",
        "weakDomains": [
          {"domain": "Services and Networking", "earned": 6, "total": 24, "percent": 25, "attempts": 2}
        ]
      }
    }
  ],
  "summary": { "attempts": 3, "passedCount": 1, "trackCount": 5, "weakDomains": [] }
}
```

Each row is a `GET /api/control/banks` entry with one field added, so
every field documented under [that endpoint](#get-apicontrolbanks)
applies unchanged. `progress` is keyed on the **bank id** — a catalog
row is a bank — while `summary.passedCount` is keyed on certification.

`bestPercent` is absent when no counted attempt exists, rather than 0:
0% is a real score and "never sat" is not. `lastAttemptAt` is the most
recent attempt of *any* kind, counted or not — a drill is still
something the candidate did.

**This endpoint is served by the facilitator, not proxied to the
conductor**, for two reasons: the conductor has no access to the state
volume, and *looking* at the exam list must never be able to trigger a
rebuild. The facilitator makes a server-side `GET` of
`/api/control/banks` with a 5-second timeout and reaches for that one
route only (`facilitator/cmd/facilitator/history.go`).

**A conductor that does not answer degrades, it does not 500.** The exam
list is the app's front door: a candidate who cannot reach it cannot
reach anything. The degraded response is the bank this facilitator has
loaded, marked available, plus one row per other bank the history
remembers, marked unavailable with a `note` saying why — this build
genuinely does not know whether those can still be switched to, and the
service that owns that answer is the one that did not reply
(`facilitator/internal/api/history.go`).

### /desktop and /desktop/

Reverse proxy to the noVNC desktop container, same-origin so the exam
UI can iframe it.

| Code | When |
|---|---|
| 308 | Exactly `/desktop`, redirected to `/desktop/` with the query string preserved, in any state (`facilitator/internal/desktop/proxy.go`). |
| 403 | No attempt is running. A small dark HTML page for the desktop root and any `*.html`, `text/plain` for every other path (`facilitator/internal/desktop/proxy.go`). |

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
(`facilitator/internal/api/api.go`).

## Conductor

Reachable only through the facilitator's `/api/control/` proxy, on the
same `:8080` origin as everything else. `GET /healthz` is the one
exception: it answers 200 `ok`
(`conductor/internal/api/api.go`) but sits outside the
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

`op` is `reset`, `switch` or `seed`; `bank` is a switch's target and `""`
for a reset. A phase `state` is `pending`, `running`, `done` or `failed`, and
`detail` is a one-line tail of that phase's command output capped at
160 bytes (`conductor/internal/control/control.go`). A failed
job carries `error` and keeps the failed phase in `lastJob`. `job` and
`lastJob` are omitted while unset.

`./sim reset` polls `busy` and then reads `lastJob.error`
(`sim`).

### GET /api/control/log

The retained command output of the job `status` is reporting: the
in-flight one while a job runs, otherwise the last settled one. Always
200.

```json
{
  "jobId": "job-1",
  "lines": ["seeding q03 (3 of 22)", "configmap/limits created"]
}
```

`lines` is a ring buffer of the last 200 lines, each truncated to 500
bytes (`conductor/internal/job/job.go`); it is `[]` rather than
`null` when nothing has been logged. A new job clears the buffer on its
first line, so the previous job's output never leaks into this one's
pane.

This is what carries the `setup.sh` output while a pooled bank prepares
an attempt — see [Preparing an attempt](#preparing-an-attempt).

### POST /api/control/reset

Rebuilds the environment on the current bank. No body. Asynchronous:
poll `/api/control/status`. Five phases — end-session, wipe-instances,
recreate-cluster, restart-instances, verify
(`conductor/internal/control/control.go`).

| Code | When |
|---|---|
| 202 | Job accepted; the body is `{"job": {...}}` (`conductor/internal/api/api.go`). |
| 409 | Another control operation is in flight (`conductor/internal/api/api.go`). |
| 500 | The job could not be started (`conductor/internal/api/api.go`). |

Reset has no session guard by design: it *is* the "abandon this
attempt" operation (`conductor/internal/control/control.go`).

### POST /api/control/reseed

Re-runs one question's `setup.sh`, restoring that question's starting
state and discarding the work done on it. Synchronous, and bounded at
240s (`conductor/internal/control/reseed.go`) — it returns an
outcome rather than a job id, and never takes the single-job lock a
rebuild needs.

```json
{"question": "q01"}
```

| Code | When |
|---|---|
| 200 | `{"ok": true}` (`conductor/internal/api/api.go`). |
| 400 | The body has no non-empty `question` (`conductor/internal/api/api.go`), or the id fails the `^q[0-9]{1,3}$` shape check or the active bank's question allowlist (`conductor/internal/control/reseed.go`). |
| 403 | The attempt is not a running Training attempt (`conductor/internal/control/reseed.go`). |
| 409 | A control job is in flight (`conductor/internal/control/reseed.go`), or another re-seed is running (`conductor/internal/control/reseed.go`). |
| 500 | `setup.sh` exited non-zero, or the session state could not be read. |

The id passes two gates because it ends up inside a shell command: the
pattern says it is well-formed, the catalog says it is real.

### POST /api/control/seed

Runs `setup.sh` for a list of questions, as a job. The facilitator calls
this — no browser does — when a pooled hands-on bank's attempt has been
drawn and its cluster has to be prepared for that draw. See
[Preparing an attempt](#preparing-an-attempt).

```json
{"questions": ["q03", "q07", "q11"]}
```

Unlike `reseed`, it takes the **hard single-job lock**. This is minutes
of work against the cluster a reset would rebuild, and it *should* raise
the full-screen overlay.

- One phase, `seed-questions`, whose `detail` counts `question N of M`.
- One exec per question, so a failure names the question and the loop
  stops there. A cluster prepared for two questions of sixteen must not
  become an exam.

| Code | When |
|---|---|
| 202 | Job accepted; the body is `{"job": {...}}` with `op: "seed"`. |
| 400 | Empty list, more than 200 ids, a duplicate id, an id that fails the `^q[0-9]{1,3}$` shape check or the active bank's allowlist, or an mcq bank (nothing to seed). |
| 409 | An attempt is running, or another control job is in flight. |

Every id passes the same two gates `reseed` uses, for the same reason.

### GET /api/control/banks

The exam catalog the exam selector renders. Always 200.

```json
{
  "active": "ckad-mock-01",
  "banks": [
    {"id": "ckad-mock-01", "title": "CKAD Mock Exam", "certification": "CKAD", "description": "Developer-track exercises...", "examType": "hands-on", "durationSeconds": 7200, "passingScore": 66, "kubernetesVersion": "1.35", "questionCount": 17, "poolCount": 26, "available": true},
    {"id": "kcna-mock", "title": "KCNA Mock Exam", "certification": "KCNA", "description": "65 questions drawn each attempt...", "examType": "mcq", "durationSeconds": 5400, "passingScore": 75, "questionCount": 65, "poolCount": 97, "available": true},
    {"id": "cks-mock", "title": "CKS Mock Exam", "certification": "CKS", "examType": "hands-on", "available": false, "comingSoon": true, "note": "Requires security add-ons not in the kind environment yet"}
  ]
}
```

| Field | Means |
|---|---|
| `questionCount` | How many questions **one attempt** draws |
| `poolCount` | How many the bank authors |

- They differ only for a pooled bank, and the exam card prints them as a
  pair (`65 / 97`) only when they do. A card reading `26 / 26` would
  advertise a pool that is not one.
- The facilitator knows both for the *active* bank, but the catalog is
  the only place that knows them for the others — and the exam selector
  draws every bank side by side.

`active` is read from `/shared/bank` at call time, so it is correct the
instant a switch rewrites it. `available` is false for a coming-soon
entry, a non-`hands-on` exam type, or a bank whose topology does not
fit the fixed `instance-1`/`instance-2` layout; `note` gives the reason
(`conductor/internal/catalog/catalog.go`).

### POST /api/control/switch

Activates a different bank: writes `/shared/bank`, rebuilds the
cluster, restarts the instances and then the bank-reading services,
facilitator last. Asynchronous. Seven phases — reset's five plus
`write-bank` before the rebuild and `restart-facilitator` after the
instances (`conductor/internal/control/control.go`).

```json
{"bank": "ckad-mock-01"}
```

| Code | When |
|---|---|
| 202 | Job accepted; the body is `{"job": {...}}` (`conductor/internal/api/api.go`). |
| 400 | The body has no non-empty `bank` (`conductor/internal/api/api.go`), or the bank is unknown, malformed or not runnable (`conductor/internal/api/api.go`). |
| 409 | An attempt is running — end it first (`conductor/internal/api/api.go`) — or another control operation is in flight (`conductor/internal/api/api.go`). |
| 500 | Switching is not configured on this conductor (`conductor/internal/control/control.go`). |

## Hub

Only in a hosted deployment. `./sim up` never runs this process, and the
SPA finds out which product it is talking to by asking for one route:
a facilitator JSON-404s `GET /api/me`, and that 404 is the whole
detection mechanism (`hub/internal/api/api.go`).

The route table is deliberately small. The hub **answers** identity,
history, admission and the control operations that replace a Pod —
everything whose truth outlives one session — and **proxies** everything
else to the candidate's own session Pod, where the facilitator described
above is unchanged and unaware any of this exists.

Every route below except `/healthz`, `GET /api/me` and the OAuth pair
requires a signed session cookie and answers `401 {"error":"not signed
in"}` without one.

### The catch-all proxy

| Code | When |
|---|---|
| — | Proxied to the candidate's Pod, unchanged. `X-Forwarded-*` is deliberately NOT set: the facilitator trusts its inputs, and a header the hub uses for auth must not be one a candidate can set. |
| 404 | The candidate has no session. Not 502 — nothing is wrong, they have not started one. |
| 503 | Not proxyable right now, which is not always the same thing as "not ready": either the Pod is genuinely booting, or a control job has just begun and `Manager.Get` has cleared the address while it replaces the Pod. Carries `Retry-After: 5` and `{"error": "...", "code": "environment_starting", "state": "..."}`. `state` can read `ready` here — during a reset or switch's stop phase the session's own `State` has not moved yet, only its address has, so the body's `state` and the fact of the 503 can disagree on purpose. |
| 502 | The Pod is unreachable. `{"error": "...", "code": "environment_unreachable"}`. |

The upgrade to the desktop's WebSocket is carried by the same proxy
(`httputil.ReverseProxy` hijacks on a 101), with `FlushInterval: -1` so
a stream is never buffered.

### GET /api/me

The hosted-mode probe, and the SPA's whole view of its own state.
Answers 200 whether or not anyone is signed in — a 401 would conflate
"hosted, logged out" with "not hosted at all".

```json
{
  "authenticated": true,
  "authMode": "github",
  "user": {"id": "583231", "login": "octocat"},
  "session": {
    "kind": "practical", "pod": "sim-session-practical-583231",
    "state": "starting", "op": "reset", "startedAt": "...", "expiresAt": "...",
    "lastSeen": "..."
  },
  "seats": {"practical": {"used": 1, "total": 3}, "mcq": {"used": 0, "total": 30}}
}
```

`session` is absent when the candidate has none, `queue` (`{"position":
2}`) is present only while they are in one, and `loginURL` replaces
`user` when they are not signed in. `seats` is reported to signed-out
callers too: someone deciding whether to sign in is entitled to know
whether there is anywhere to sit.

`state` is `pending` (a seat is held, someone else is booting first),
`starting` (their own Pod is building), `ready`, or `failed` — which
keeps the seat so they can read why before it is reaped.

`op` is `reset` or `switch` while a control job is replacing the Pod,
and absent the rest of the time, including on a first boot.

It is **server truth**, set by the hub rather than remembered from a
click, so it is still correct after a reload lands mid-rebuild. A
client's own memory of having pressed "New attempt" would not survive
that reload.

### POST /api/session/start

Admission first, then the facilitator's own start. The two are separate
events minutes apart, and the same path does both in that order.

| Code | When |
|---|---|
| 202 | A seat was granted and a Pod is being built. `{"starting": true, "state": "..."}` with `Retry-After: 5`. |
| 409 | Every seat of that flavour is taken. `{"queued": true, "position": 2, "seats": {...}, "kind": "practical"}`. |
| 400 | The body names a `kind` that is not `practical` or `mcq`. |
| 502 | The Pod failed to boot; the body carries the reason. |
| — | Once the Pod is ready, the request is forwarded to it unchanged and the facilitator's own answer is returned. |

The body is `{"kind": "practical"}` for admission and the facilitator's
own `StartOptions` for an attempt. The SPA never sends the first form to
a ready session: on the ready path this is the facilitator's endpoint,
and a body naming a kind and no mode would start an unconfigured
attempt.

### POST /hub/session/end

Gives up the seat and destroys the Pod. 204, or 204 if there was nothing
to end. A queued candidate with no session is dequeued by the same call.

Deliberately not `POST /api/session/end`, which is the facilitator's and
ends the **attempt** — grading it and writing its record while the
environment stays up so the candidate can read their score. Ending the
seat is a different act, and a candidate who confused the two would lose
their results to a misclick.

### POST /api/control/reset, POST /api/control/switch

A hosted reset or switch **replaces the Pod** rather than rebuilding in
place:

- The conductor cannot restart a container it reaches over ssh.
- A Pod has no per-container restart under `restartPolicy: Never`.

Both answer in the conductor's own `202`-plus-job shape.
`GET /api/control/status` and `/api/control/log` answer from the hub's
job store rather than the conductor's, because the Pod they describe may
not exist while they run.

### Attempt history

`GET /api/history` returns the same shape the facilitator's does —
attempts most recent first, with the cross-attempt rollup beside them —
so the dashboard needs no hosted branch. It is the hub's store, never
the Pod's: a route answered there would answer from the copy that is
about to be destroyed.

| Route | Behaviour |
|---|---|
| `GET /api/history` | `{"attempts": [...], "summary": {...}}`, newest first |
| `GET /api/history/{attempt}` | The full graded-results document. Scoped to the caller's own user directory, so someone else's attempt id is simply not found. Hosted only — a local facilitator keeps the summary row and lets the next attempt overwrite the results. |
| `GET /api/history/export` | The interchange document (`{"version":1,"attempts":[...]}`, oldest first). Importable by a local `./sim`. |
| `DELETE /api/history` | Erases the user's directory: every attempt and every results blob. |
| `POST /api/history/import` | 501, with the reason. |
| `GET /api/history/summary` | 501 — the CLI's route, and answering it wrongly would be worse than not answering. |

### POST /hub/ingest/history

How a graded attempt reaches the store. The session Pod's facilitator
posts `{"record": {...}, "results": {...}}` with a bearer ticket; the
hub reads the user out of the ticket and never out of the body, because
a Pod that could name its own user could write into anyone's history.

The ticket is signed with a key derived from `COOKIE_KEY` — `HMAC-SHA256(key,
"history-ingest")` — so it can never be spent as that candidate's login,
and the login cookie can never be spent as a ticket.

Under `/hub/`, not `/api/`, and deliberately: `/api/` is the candidate's
surface, and this is the Pod talking to the hub about them.

| Code | When |
|---|---|
| 200 | `{"recorded": true}`, or `false` if that attempt id was already stored — a retried delivery records nothing twice. |
| 400 | No record in the body. |
| 401 | The ticket is missing, forged, or expired. Expiry is logged separately and answered identically. |

### /hub/auth/*

`GET /hub/auth/login` redirects to GitHub with a CSRF state cookie
scoped to `/hub/auth`; `GET /hub/auth/callback` checks that state before
anything else and redirects to `/` on success; `POST /hub/auth/logout`
clears the cookie and answers 204. All three answer 404 in
`AUTH_MODE=header` and `none`, where there is nothing to log in to.
