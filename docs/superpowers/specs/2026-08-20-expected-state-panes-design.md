# Expected-state panes — design

Every failed check on the explanation screen should show the candidate what their
cluster held **beside what it should have held**, and mark the difference. Today
19 of 212 checks do. The other 193 print a paragraph telling the candidate to go
read the reference solution and work it out themselves.

This document specifies how the remaining 193 get an expected pane or an explicit,
reasoned declaration that they cannot have one — and how both are enforced so the
state cannot silently regress.

Written 2026-08-20 on `feature/enhance-results`. Scope is `cka-mock-01` and
`ckad-mock-01`.

---

## 1. The problem, measured

The complaint, in the user's words:

> The expected state is not always shown, majority of questions mention that no
> desired state is available and to refer to the solution when in fact for most of
> the CKA questions there are JSON objects which we could compare with the expected
> one […] Is usually a wall of text explaining with no real comparison of how would
> it had look if it was correct against what we got from your cluster.

The measurement:

| | CKA | CKAD | Total |
|---|---|---|---|
| Checks | 70 | 142 | 212 |
| Checks emitting an `expected` pane | 4 | 15 | 19 |
| `expected/` documents on disk | 4 | 11 | 15 |

So the "no counterpart, go read the solution" note at `ui/src/strings.ts:903` is
not an edge case. It is the default experience — 91% of checks.

**The fix is this repository's own written doctrine, applied at scale.**
`docs/bank-spec.md:610-650` already says expected documents live at
`banks/<bank-id>/<qid>/expected/<name>`, are "generated from the reference
solution, never hand-written", and that both panes must be filtered identically.
That doctrine was written and then applied to 19 checks. What is missing is not
the idea; it is a mechanism that makes it structural and a gate that makes
skipping it visible.

One line of the existing doctrine is inverted by this design.
`docs/bank-spec.md:643-645` currently reads: *"A question with no `expected/`
document is fine […] **Prefer that to inventing one.**"* Silence and a considered
decision look identical under that rule, which is exactly how 193 checks came to
have no pane without anyone deciding they shouldn't. The new rule is: **prefer
declaring to inventing.** A check with no expected document says so, in the file,
with a reason.

---

## 2. Mechanics that constrain the design

Five facts about how this system already works. Each one rules out an approach
that would otherwise be obvious.

**A check that passes loses its artifacts entirely** (`docs/bank-spec.md:600`).
On a solved cluster nothing is emitted at all. Expected documents therefore cannot
be harvested by grading a solved attempt and scraping the output — the very run
that would produce correct documents is the run that emits nothing.

**`evidence()` is only reached on failure.** Every existing evidence helper sits
inside a failure branch. Capture cannot ride on the emitters for the same reason.

**`/banks` is mounted read-only** in every container
(`docker-compose.yaml:16,36,59,90,114,135`). A check cannot write its own expected
document to where that document lives. Capture must emit to stdout and be
redirected by the harness on the host.

**The grader invokes a check as**
`KUBECONFIG=/home/candidate/.kube/config BANK=<bank> bash /banks/<bank>/<qid>/validate.d/<script>`
(`facilitator/internal/evaluate/evaluate.go:95`). So `$0` carries both the bank and
the qid, and `BANK` is always set in production.

**`tests/check-evidence.sh:44` rewrites the check** into `$tmp/chk.sh` before
running it, to redirect the `. /banks/_lib/checks.sh` source line at the tree under
test. That destroys `$0`, so any path resolution based on it needs an offline
escape hatch.

Two smaller facts that make the design safe:

- No validate script anywhere defines a `trap`, so the library may install an
  `EXIT` trap without colliding with one.
- The grader parses only the `# points: ` and `# desc: ` line prefixes
  (`facilitator/internal/exam/exam.go:437-438`). A third `# expected:` header is an
  ordinary comment to it — inert in production, meaningful to the tooling.

---

## 3. The check-side contract

Every check gains **one function and one header**.

### 3.1 `snapshot()`

The projection the check already builds inline, lifted into a named function
declared unconditionally at the top level. Before —
`banks/cka-mock-01/q01/validate.d/20_probe.sh`:

```sh
evidence() {
  show_actual json "$(printf '%s' "${spec:-null}" \
    | jq '{ports: (.ports // null), readinessProbe: (.readinessProbe // null)}' 2>/dev/null)"
  show_why "$1"
}
```

After:

```sh
# expected: probe.json json
snapshot() {
  printf '%s' "${spec:-null}" \
    | jq -S '{ports: (.ports // null), readinessProbe: (.readinessProbe // null)}' 2>/dev/null
}

evidence() {
  show_pair json probe.json
  show_why "$1"
}
```

`snapshot` is the check's existing pane expression, moved and named — nothing more.
Where the check captured its reading into a variable, `snapshot` reads that
variable; where the pane was built by a command inside the evidence helper, that
command moves into `snapshot` unchanged. Either way the expected document is a
projection of exactly what the check grades, rather than a second, drifting opinion
of it.

### 3.2 `show_pair <lang> <name>`

New in `banks/_lib/checks.sh`, beside the existing emitters at `:80-107`:

```sh
show_pair() {
  _artifact actual "$1" "$(snapshot)"
  show_expected "$1" "$(expected_dir)/$2"
}
```

One function feeds both panes from one pipeline, so *"filter both panes
identically"* (`docs/bank-spec.md:632`) stops being a rule an author must remember
193 times and becomes the only way to write the code.

`expected_dir` resolves from the script's own path — `dirname` twice, plus
`/expected`:

```sh
expected_dir() {
  local p=${SIM_CHECK_PATH:-$0}
  printf '%s/expected' "$(dirname "$(dirname "$p")")"
}
```

This replaces the current call shape,
`show_expected yaml "/banks/${BANK:-cka-mock-01}/q15/expected/gateway.yaml"`, and
removes two latent defects the sweep would otherwise copy 193 times: a bank
fallback that reads another bank's documents when `BANK` is unset, and the qid
repeated in a string literal — precisely the copy-paste that parallel authoring
gets wrong.

`tests/check-evidence.sh` exports `SIM_CHECK_PATH` with the true repository-relative
path when it runs its rewritten copy, so the offline gate resolves the same
documents the grader does. That is the only reason the variable exists; nothing in
production sets it.

**Empty-body handling.** `_artifact` currently rewrites an empty or `null` body to
the `ARTIFACT_EMPTY` placeholder *and forces `lang` to `text`*
(`banks/_lib/checks.sh:82-88`). Under `show_pair` the declared `lang` is kept, so
the two panes stay comparable and the diff renders as "everything in the expected
document is missing" rather than as a language mismatch.

### 3.3 The `# expected:` header

Uniform with the two headers already parsed from a check, and placed with them:

```sh
#!/usr/bin/env bash
# points: 3
# desc: the readiness probe targets the port the container serves
# expected: probe.json json
```

The header is what lets the capture harness and the offline gate know a check's
target filename and language **without executing it**.

The opt-out is the same header, and carries its reason:

```sh
# expected: none — the check grades whether the PV's uid still matches the one
#           the inventory ConfigMap recorded, so its target is a relationship
#           between two live values, not a document. A captured uid is stale
#           the moment it is written.
```

A check carrying neither form fails the gate. This is the whole point of the
declaration: **omission and decision must not look alike.**

---

## 4. The capture pipeline

New script `tests/capture-expected.sh`, run against a live stack:

```
tests/capture-expected.sh <bank> [qNN…] [--check]

  ./sim reset                                     # fresh environment, no prior draw
  for each question:
    docker compose exec -T <instance> su - candidate \
      -c 'bash /tests/solutions/<bank>/qNN.sh'
    for each check declaring `# expected: <name> <lang>`:
      docker compose exec -T <instance> env SIM_CAPTURE_EXPECTED=1 \
        KUBECONFIG=/home/candidate/.kube/config BANK=<bank> \
        bash /banks/<bank>/qNN/validate.d/<script>
      → slice output after the sentinel → banks/<bank>/qNN/expected/<name>
```

The **instance** comes from that question's `instance:` field in `exam.yaml` — the
same field the grader routes on. A check that reads instance-2's cluster must be
captured from instance-2.

### 4.1 Why an EXIT trap

`banks/_lib/checks.sh` installs, at source time:

```sh
if [ -n "${SIM_CAPTURE_EXPECTED:-}" ]; then
  trap '_capture_emit' EXIT
fi
```

The trap fires after the check's body has run, with every variable still in scope.
Bash resolves `snapshot` at fire time, so the function may be declared anywhere
after the source line. A check that declares no `snapshot` (an opt-out) emits
nothing.

Under capture the artifact emitters are silenced — capture mode is not grading
mode. The silencing lives in `_artifact` itself, not in `show_actual`, because
`show_pair` reaches `_artifact` directly. The trap then prints exactly one block:

```
---8<--- sim:capture json
{"ports": …, "readinessProbe": …}
```

The harness slices from the sentinel, so any ordinary output the check printed
before exiting is discarded without ambiguity.

### 4.2 Three refusals

Each writes nothing and fails the run loudly:

1. **An empty or `null` snapshot.** This is what an early `exit 1` from a gate
   produces, and it means the cluster was not actually solved. Writing that file
   would teach every future candidate that the correct answer is `null`.
2. **A reference solution that did not exit clean.**
3. **A declared document whose check produced no `sim:capture` block at all.**

A header of `none` is skipped by declaration, not by failure.

### 4.3 `--check`

Captures to a temporary file and diffs against what is on disk instead of writing.
An `expected/` document is generated output; like any generated file it must be
provably reproducible from its source. Drift means a check's projection changed and
its document did not.

---

## 5. The sweep

### 5.1 The taxonomy

Sampling every pane across the 212 checks:

| Pane the check shows | Checks | Pairs? |
|---|---|---|
| a `jq`/`yq` projection (`show_actual json` or `yaml`) | 126 | yes |
| the content of a file the candidate wrote (`cat`, `file_text`) | 21 | yes, as text |
| a `kubectl get` table, a name list, a count, or a "ready / reachable / complete" reading | 65 | mostly no |

The decision rule, in one line:

> **Pair when the check grades a *shape the candidate authored*. Opt out when it
> grades an *event*, a *measurement*, or a *relationship between two live values*.**

The third clause is the trap, and it is why "capture everything" would be actively
harmful. `banks/cka-mock-01/q24/validate.d/10_volume.sh` prints a readable
key/value block — phase, policy, `uid`, `created`, `claimRef uid` — and grades
whether the PersistentVolume is *still the same object* the inventory ConfigMap
recorded. Capture it and the document freezes one run's uid and creationTimestamp,
and every future candidate who solves it perfectly is told their answer differs.
That check opts out, with that reason.

The repository already contains one correctly reasoned opt-out —
`ckad-mock-01/q19/20_reachable.sh`, documented at `docs/bank-spec.md:647-650`,
because an EndpointSlice carries a controller-generated name suffix and Pod IPs.
This design generalises that single instance into a required declaration.

### 5.2 Two rules for every projection

Both aimed at the same failure mode: telling a correct answer that it is wrong.

**Only what this check grades.** Not the object. A check scoring a readiness probe
projects ports and the probe, not the whole container spec. A whole-object pane
marks every field the candidate legitimately set differently as a difference, which
is a false lesson delivered with the authority of a diff.

**Sort what has no meaningful order.** RBAC `verbs: ["get","list"]` and
`["list","get"]` are the same Role; unsorted, one of them renders a two-line
difference. Projections use `jq -S` for key order, sort scalar arrays where order
carries no meaning, and use the existing `k8s_clean` (`banks/_lib/checks.sh:220-234`)
for YAML — which already deletes server-assigned fields on the value rather than the
key.

### 5.3 Multi-pane checks

Around 30 checks call `show_actual` two to four times, once per failure branch. The
pairing attaches to the **grading branch only**. A gate that fires because the
object does not exist keeps its plain `show_actual` orientation table: comparing "the
namespace is empty" against a target document is not a diff, it is the solution, and
the solution is already on the page.

### 5.4 The 19 existing pairs

They are re-expressed through `show_pair` and re-captured, so the bank ends with one
mechanism rather than two. One of them needs a decision rather than a mechanical
rewrite: `ckad-mock-01/q35/validate.d/20_patched.sh:15,22` points `show_expected` at
`files/base/deployment.yaml` — a **seed input**, not a generated target. Showing the
base manifest under the heading "Expected" tells the candidate the input was the
answer. It is either re-pointed at a captured document or converted to an opt-out.

### 5.5 Who does it

The refactor is entirely offline — no cluster, no capture — so it parallelises on
the unit this repository has proven: **ownership by question directory, zero shared
files.** 70 directories (26 CKA + 44 CKAD), grouped 4–5 per agent, is roughly **16
agents over two or three waves.**

Each agent's deliverable, for every check in its directories: either `snapshot()` +
`# expected:` header + `show_pair` wiring, or a `# expected: none — <reason>`
declaration.

Agents **never create `expected/` files.** They have no cluster, and a hand-written
expected document is precisely what `docs/bank-spec.md:616-619` forbids.

---

## 6. Gates

### 6.1 Offline — new `tests/check-expected.sh`, wired into CI

Beside the other bank gates in `.github/workflows/ci.yml:19-37`.

1. Every check carries exactly one `# expected:` header. Missing → fail. This is
   the rule that makes all 212 decisions visible in the tree.
2. A `none` declaration carries a non-empty reason after the dash.
3. A check declaring a name defines `snapshot()` and calls `show_pair` with a
   matching lang and name; a check declaring `none` has neither.
4. Every declared document exists under `expected/`.
5. No orphans: every file under `expected/` is claimed by a check.

Rules 4 and 5 close a real hole — `show_expected` today is
`[ -f "$2" ] || return 0` (`banks/_lib/checks.sh:102-106`), so a check pointing at a
document that does not exist silently shows no pane and nothing anywhere reports it.

### 6.2 Live — run where `tests/drill.sh` runs

6. **`tests/capture-expected.sh --check`** — recapture against a freshly solved
   cluster and diff. Drift fails.
7. **Fresh-environment divergence.** Every paired check, run against an *unsolved*
   cluster, must produce two panes that differ. A pair that already matches before
   any work is done proves nothing — its projection does not cover what the check
   grades. This is the repository's "break it once before it counts as coverage"
   rule applied to panes rather than to assertions.

Neither live gate can run in CI: both need a cluster.

---

## 7. UI

Almost nothing to build. Two panes, the LCS diff, the `-`/`+` markers and the
too-long fallback already exist (`ui/src/screens/Explain.tsx:302-347`). Feed the
component a second artifact and it renders the comparison. What changes is text,
plus one guardrail.

**`actualOnlyNote` (`ui/src/strings.ts:903`)** today tells a candidate their state
has "no authored counterpart to sit beside, so compare it against the reference
solution below". After the sweep it fires only where a check *declared* it has no
comparable side, so it is reworded from an apology for a missing feature into a
statement of fact: this check grades a measurement rather than a document.
**`noEvidenceBody` (`:914`)** gets the same treatment at the task level.

**The guardrail is the new risk this feature introduces.** A narrow expected pane
can be misread as "this is what the whole object should look like" — and it is not;
it is the graded surface only. The legend (`:892`) gains a sentence saying exactly
that, and renders whenever a pair is shown rather than only when lines are marked.
Without it we would trade the old wall of text for a new wrong lesson.

**`expectedOnlyNote` (`:906`) stays** even though `show_pair` always emits both
panes. Attempts recorded before this change are replayed from hub history and may
carry an expected-only artifact; deleting the string would blank a pane on someone's
saved attempt.

**`diffIdentical` (`:897`) stays**, and becomes a diagnostic: with a correct
projection, two identical panes on a failed check mean the projection does not cover
the graded field. Live gate 7 is what catches that before a candidate sees it.

---

## 8. Files

**Created**
- `tests/capture-expected.sh` — the capture harness and its `--check` mode
- `tests/check-expected.sh` — offline gate, rules 1–5
- `banks/<bank>/<qid>/expected/<name>` — one per paired check, less those shared
  by sibling checks in the same question, so on the order of 120–145 documents

**Modified**
- `banks/_lib/checks.sh` — `show_pair`, `expected_dir`, the capture trap, the
  `_artifact` empty-body lang fix
- `banks/cka-mock-01/q*/validate.d/*.sh`, `banks/ckad-mock-01/q*/validate.d/*.sh` —
  all 212 checks
- `tests/check-evidence.sh` — export `SIM_CHECK_PATH`
- `tests/drill.sh` — invoke the two live gates
- `.github/workflows/ci.yml` — run `tests/check-expected.sh`
- `ui/src/strings.ts` — `actualOnlyNote`, `noEvidenceBody`, `diffLegend`
- `ui/src/screens/Explain.tsx` — render the legend whenever a pair is shown
- `docs/bank-spec.md:542-650` — replace the hand recipe with the contract

---

## 9. Order

1. **Prep commit** — `checks.sh`, `tests/capture-expected.sh`,
   `tests/check-expected.sh`, `docs/bank-spec.md`. Every agent reads these, so they
   land first and land whole.
2. **Sweep waves** — ~16 agents over the 70 question directories. Offline only.
   `tests/check-expected.sh` rules 1–3 go green here; rules 4–5 stay red until
   capture, which is expected and documented.
3. **Capture pass** — mine alone, needs the cluster. Produces every `expected/`
   document. Rules 4–5 go green.
4. **Live gates** — `--check` and fresh-environment divergence.
5. **UI copy + browser pass** — the only evidence about rendering that counts.

Step 2's interim red is the same shape as the CKA track's `bank-weights` red: a gate
that fails in both directions is doing its job while the tree is half-built. Nothing
is pushed until step 4.

---

## 10. Risks

**A captured document teaches a correct answer that it is wrong.** The worst
possible outcome of this feature, and the reason for §5.2 (narrow, canonicalised
projections), §5.1 (the relationship-between-live-values opt-out) and live gate 7.

**A projection that grades nothing.** Live gate 7 — panes that match on an unsolved
cluster.

**Silent staleness.** A check's projection changes, its document does not, and the
diff quietly teaches the old shape. Live gate 6.

**Parallel authoring collisions.** Mitigated by directory ownership: no two agents
touch the same file, and the shared library lands before any of them start.

**An agent killed mid-task leaves a half-refactored check.** The offline gate fails
closed on a check that declares a name without `show_pair`, so a partial refactor
cannot ship green. Per the standing protocol, any lane whose agent died is diffed
before it is trusted.

---

## 11. Out of scope

The **take-away report and study path** — the user's other pick from the results
brainstorm, deliberately sequenced after this. It gets its own spec. This project
ends when a failed check shows the candidate what their cluster held beside what it
should have held.

---

## 12. Verification

1. `tests/check-expected.sh` green — 212 declarations, no orphans, no missing
   documents.
2. Full offline suite green: lint, lib, evidence, weights, hints, figures, pins,
   shell, line-endings, sim-parity.
3. `tests/capture-expected.sh --check` green on both banks against a live stack.
4. Fresh-environment divergence green for every paired check.
5. `tests/drill.sh` green on both banks — every question still solved and graded to
   full marks after the refactor.
6. Browser pass on the Explain page: a failed task showing a marked diff, a task
   with a declared opt-out showing the reworded note, and the legend reading
   correctly beside a narrow pane.
