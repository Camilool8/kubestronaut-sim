# kubestronaut-sim

Open-source, killer.sh-style exam simulator for the Kubestronaut certifications.
Deliberately harder than the real exams. Starting with CKAD.

**Status: early development — Milestone A (CLI exam foundation).**

Code: Apache-2.0. Question banks: CC BY-SA 4.0 (see `banks/LICENSE`).
Not affiliated with CNCF, The Linux Foundation, PSI, or killer.sh.

## Quickstart (Milestone A — CLI exam)

Requires Docker Desktop (or docker + compose v2). ~9GB RAM free (XFCE desktop included).

    ./sim up                 # boots cluster + instances (first run: several minutes)
    open http://localhost:6080/vnc.html   # exam desktop (Firefox = docs only)
    cat banks/ckad-mock-01/q01/question.md
    ./sim ssh ckad-1         # solve it (user: candidate)
    ./sim grade              # killer.sh-style scoreboard
    ./sim reset              # wipe your answers, fresh exam (fast — keeps caches)
    ./sim down               # stop (cluster state persists — resume where you left off)
    ./sim purge              # stop and delete all volumes (full clean slate)

Note: `down` + `up` resumes your exam state; use `reset` for a fresh attempt.

Solutions: `banks/ckad-mock-01/<q>/solution.md`.
