#!/usr/bin/env bash
# Boot phase reporting for k8s-env.
#
# The problem this solves: /shared/ready is a single bit, written at the
# very end of bootstrap.sh. Until it appears, every observer — the compose
# healthcheck, `./sim up`, the browser — knows exactly one thing, which is
# "not yet". A cold first boot spends minutes in that state, and a boot
# that has genuinely failed spends forever in it. The two are
# indistinguishable from outside, which is the defect docs/follow-ups.md
# has carried as "downstream currently sees only healthcheck timeout".
#
# So: a phase file alongside the ready marker. /shared/ready stays the
# authority on readiness — nothing here replaces it — but while it is
# absent, this says which step is running, how far through we are, and
# whether the whole thing has already died.
#
# Written atomically (temp file, then mv onto the target) because the
# facilitator reads it on an unsynchronised 2s poll: a reader must never
# catch a half-written file. Rendered by jq rather than printf so a label
# or an error message containing a quote cannot produce invalid JSON.

BOOT_FILE=${BOOT_FILE:-/shared/boot.json}
BOOT_TOTAL_PHASES=${BOOT_TOTAL_PHASES:-8}

# Set once at first phase() call so elapsed time survives across the
# start.sh -> bootstrap.sh boundary.
_boot_started=""
_boot_phase=""
_boot_label=""
_boot_step=0

_boot_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# _boot_write <state> <detail> <error>
_boot_write() {
  local state=$1 detail=$2 error=$3 tmp
  [ -n "$_boot_started" ] || _boot_started=$(_boot_now)
  tmp="${BOOT_FILE}.$$"
  jq -n \
    --arg state "$state" \
    --arg phase "$_boot_phase" \
    --arg label "$_boot_label" \
    --arg detail "$detail" \
    --arg error "$error" \
    --arg bank "${BANK:-}" \
    --arg startedAt "$_boot_started" \
    --arg updatedAt "$(_boot_now)" \
    --argjson step "$_boot_step" \
    --argjson totalSteps "$BOOT_TOTAL_PHASES" \
    '{version: 1, state: $state, phase: $phase, label: $label,
      detail: $detail, error: $error, bank: $bank,
      step: $step, totalSteps: $totalSteps,
      startedAt: $startedAt, updatedAt: $updatedAt}' \
    > "$tmp" 2>/dev/null && mv -f "$tmp" "$BOOT_FILE" || rm -f "$tmp"
}

# phase <id> <label> [step]
#
# Starts a phase. Also echoes the label, so `docker compose logs k8s-env`
# and the phase file tell the same story — the log is what someone reads
# when the UI is the thing that is broken.
phase() {
  _boot_phase=$1
  _boot_label=$2
  _boot_step=${3:-$((_boot_step + 1))}
  echo "[boot ${_boot_step}/${BOOT_TOTAL_PHASES}] ${_boot_label}"
  _boot_write booting "" ""
}

# detail <line>
#
# Sub-phase progress within the current phase — "seeding q11 of 22", an
# image being pulled. Cheap enough to call in a loop.
detail() {
  _boot_write booting "$1" ""
}

# boot_ready
#
# Terminal success. /shared/ready is still what the healthcheck tests;
# this only makes the phase file agree with it.
boot_ready() {
  _boot_phase=ready
  _boot_label="Environment ready"
  _boot_step=$BOOT_TOTAL_PHASES
  _boot_write ready "" ""
}

# boot_failed <message>
#
# Terminal failure. Does not exit — the caller decides, and in start.sh
# the caller deliberately keeps the container alive so the UI can render
# this message and the conductor can still exec a retry into it.
boot_failed() {
  echo "[boot] FAILED: $1" >&2
  _boot_write failed "" "$1"
}

# boot_idle
#
# Resting, not working: the container is up and no exam has been chosen,
# so there is nothing to build yet. Distinct from `booting` because the
# two want opposite things from the UI — a boot screen narrates progress
# and asks the candidate to wait, while this one should get out of the
# way and let them pick an exam.
#
# Reached only under compose with no BANK. A hosted session Pod is
# always stamped with the exam it was created for, so it never idles.
boot_idle() {
  _boot_phase=awaiting-exam
  _boot_label="Waiting for an exam to be chosen"
  # The two phases that have run are the ones that are not about any
  # particular exam: the container runtime and the chart repository.
  _boot_step=2
  echo "[boot] no exam selected; nothing to build until one is chosen"
  _boot_write idle "" ""
}
