# kubestronaut-sim

Open-source, killer.sh-style exam simulator for the Kubestronaut
certifications. Deliberately harder than the real exams. CKAD and CKA
banks today; KCNA/KCSA (multiple choice) and CKS are on the roadmap and
appear in the catalog as coming soon.

**Status: Milestone E — product polish (live control plane, clipboard,
Kubernetes-blue design system, responsive + mobile gate).**

Code: Apache-2.0. Question banks: CC BY-SA 4.0 (see `banks/LICENSE`).
Not affiliated with CNCF, The Linux Foundation, PSI, or killer.sh.
Kubernetes and the certification names are trademarks of The Linux
Foundation. (The same notice, plus a real-exam comparison table, lives in
the app's About panel.)

## Quickstart

Requires Docker Desktop (or docker + compose v2). ~9GB RAM free (XFCE
desktop included).

    ./sim up                     # boots everything (first run: several minutes)
    open http://localhost:8080   # then never touch the CLI again

Everything after `up` happens in the browser: pick an exam from the
lobby catalog, start the timed session, work on the embedded desktop,
submit, read your score with per-check results and solutions, then start
a **new attempt** or **switch to a different exam** — both buttons drive
the full environment rebuild with a live progress checklist that shows
each step's duration and the cluster's own output as it goes.

**Click any value in a question to copy it**, then paste in the exam
terminal with Ctrl+Shift+V. Resource names, labels, image tags and
`/opt/course` paths all have to be exact, and retyping them is how
avoidable zeros happen.

`down` + `up` resumes your exam state (including an in-progress
session). Light and dark themes follow your system, with a toggle in the
corner. The exam itself needs a desktop — a keyboard and room for a
terminal beside the questions — so phones get a screen saying so rather
than a broken layout, while the catalog and past scores stay readable
there.

## What the exam feels like

1. **Lobby** — the exam catalog (active bank highlighted; unavailable
   certifications shown with the reason), duration/passing-score stats,
   and the Start button.
2. **Exam view** — timer bar with 30/15/5-minute warnings, the question
   panel (with a chip naming the instance to ssh into), and the exam
   desktop rendered by a built-in VNC client. The desktop comes ready:
   the terminal is already open showing the exam banner, and the panel
   has Terminal + Firefox (docs-allowlist only) launchers. A first-run
   tour points out the moving parts.
3. **End** — submit early or let the timer expire; the desktop locks
   immediately and grading runs in the background.
4. **Score** — percent, pass/fail, how the session ended, expandable
   per-question checks, full solutions, and the New attempt button.

Desktop access and the solutions endpoint are gated by session state
(403 until running, or ended, respectively) purely for UX fidelity with
the real exam — this is **not a security boundary**: every bank file,
including `solution.md`, already sits unencrypted on your own disk.

## Architecture note: the conductor

Reset and exam switching rebuild the kind cluster and restart services.
That power lives in a dedicated `conductor` container — the **only**
container mounting the Docker socket — kept off the exam network on an
internal-only network behind the facilitator's `/api/control/*` proxy.
The exam-facing services never see the socket. On this single-user local
tool the browser (and therefore the candidate) can reach the control
API; the boundary being defended is privilege, not candidate access.

## CLI (optional after `up`)

    ./sim up [bank]          # boot; bank argument only sets the first-boot default
    ./sim down               # stop (state persists — resume where you left off)
    ./sim purge              # stop and delete all volumes (full clean slate)
    ./sim reset              # same code path as the UI's New attempt button
    ./sim ssh instance-1     # dev shortcut into an instance (user: candidate)
    ./sim grade              # killer.sh-style scoreboard (session-independent)

Bank switching from the CLI is deliberately absent — use the lobby; the
active bank lives in `/shared/bank` and is owned by the conductor after
first boot.

Solutions: `banks/<bank>/<q>/solution.md` (also served, once your
session has ended, from the score page).

## Verification

`tests/smoke.sh` is the end-to-end gate (~25 min, destructive: it purges
first). It covers the cold boot, solving both banks, session lifecycle,
warm restart, UI-path reset, the CKAD→CKA→CKAD switch round-trip,
conductor network isolation, desktop readiness, and session auto-expiry.
