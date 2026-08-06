#!/usr/bin/env bash

BOOT_FILE=${BOOT_FILE:-/shared/boot.json}
BOOT_TOTAL_PHASES=${BOOT_TOTAL_PHASES:-8}

_boot_started=""
_boot_phase=""
_boot_label=""
_boot_step=0

_boot_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

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

phase() {
  _boot_phase=$1
  _boot_label=$2
  _boot_step=${3:-$((_boot_step + 1))}
  echo "[boot ${_boot_step}/${BOOT_TOTAL_PHASES}] ${_boot_label}"
  _boot_write booting "" ""
}

detail() {
  _boot_write booting "$1" ""
}

boot_ready() {
  _boot_phase=ready
  _boot_label="Environment ready"
  _boot_step=$BOOT_TOTAL_PHASES
  _boot_write ready "" ""
}

boot_failed() {
  echo "[boot] FAILED: $1" >&2
  _boot_write failed "" "$1"
}

boot_idle() {
  _boot_phase=awaiting-exam
  _boot_label="Waiting for an exam to be chosen"

  _boot_step=2
  echo "[boot] no exam selected; nothing to build until one is chosen"
  _boot_write idle "" ""
}
