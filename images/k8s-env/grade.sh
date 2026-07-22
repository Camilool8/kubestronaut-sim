#!/usr/bin/env bash
set -uo pipefail
BANK=${BANK:?}
BANK_DIR="/banks/${BANK}"
SSH="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o BatchMode=yes -o ConnectTimeout=10 -i /shared/ssh/id_ed25519"
earned=0; total=0
echo "=== ${BANK} results ==="
for qid in $(yq -r '.spec.questions[].id' "${BANK_DIR}/exam.yaml"); do
  instance=$(yq -r ".spec.questions[] | select(.id == \"${qid}\") | .instance" "${BANK_DIR}/exam.yaml")
  echo ""
  echo "-- ${qid} (on ${instance})"
  for script in "${BANK_DIR}/${qid}"/validate.d/*.sh; do
    pts=$(sed -n 's/^# points: //p' "$script" | head -1)
    desc=$(sed -n 's/^# desc: //p' "$script" | head -1)
    case "$pts" in (''|*[!0-9]*) echo "  [SKIP] $(basename "$script"): bad '# points:' header"; continue ;; esac
    total=$((total + pts))
    msg=$($SSH "root@${instance}" \
      "KUBECONFIG=/home/candidate/.kube/config bash /banks/${BANK}/${qid}/validate.d/$(basename "$script")" 2>&1)
    if [ $? -eq 0 ]; then
      earned=$((earned + pts))
      printf '  [PASS] %s (%s pts) — %s\n' "$desc" "$pts" "$msg"
    else
      printf '  [FAIL] %s (0/%s pts) — %s\n' "$desc" "$pts" "$msg"
    fi
  done
done
pct=$(( total > 0 ? earned * 100 / total : 0 ))
echo ""
echo "=== Score: ${earned}/${total} (${pct}%) ==="
echo "RESULT ${earned} ${total} ${pct}"
exit 0
