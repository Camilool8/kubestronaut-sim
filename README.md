# kubestronaut-sim

Open-source, killer.sh-style exam simulator for the Kubestronaut certifications.
Deliberately harder than the real exams. Starting with CKAD.

**Status: early development — Milestone C (facilitator + exam UI).**

Code: Apache-2.0. Question banks: CC BY-SA 4.0 (see `banks/LICENSE`).
Not affiliated with CNCF, The Linux Foundation, PSI, or killer.sh.

## Quickstart

Requires Docker Desktop (or docker + compose v2). ~9GB RAM free (XFCE desktop included).

    ./sim up                 # boots cluster + instances (first run: several minutes)
    open http://localhost:8080   # exam UI: start screen -> timed exam -> score page

Note: `down` + `up` resumes your exam state (including an in-progress
session); use `reset` for a fresh attempt.

## Exam flow

The exam UI at `http://localhost:8080` is the one entry point — the desktop
is reachable only through it (no separate port to open):

1. **Start screen** — exam title, duration, and tips; start the countdown
   whenever you're ready.
2. **Exam view** — a timer bar, the question list/panel (per-instance
   markdown), and an embedded noVNC desktop (XFCE terminal + a docs-only
   Firefox) where you actually solve questions, ssh'd into each instance
   exactly like the real exam.
3. **End** — submit early, or let the timer expire; either way the desktop
   locks immediately and the exam grades asynchronously in the background.
4. **Score page** — total percent, pass/fail, expandable per-question
   checks, and full solutions.

Desktop access and the solutions endpoint are gated by session state (403
until the session is running, or has ended, respectively) purely for UX
fidelity with the real exam — this is **not a security boundary**: every
bank file, including `solution.md`, already sits unencrypted on your own
disk regardless of what the API reports.

While an exam is running (or any time, from your host), you can also:

    cat banks/ckad-mock-01/q01/question.md
    ./sim ssh ckad-1         # solve it directly (user: candidate), no desktop needed
    ./sim grade              # killer.sh-style scoreboard (session-independent)
    ./sim reset              # wipe your answers, fresh exam (fast — keeps caches)
    ./sim down               # stop (cluster state persists — resume where you left off)
    ./sim purge              # stop and delete all volumes (full clean slate)

Solutions: `banks/ckad-mock-01/<q>/solution.md` (also served, once your
session has ended, from the score page).
