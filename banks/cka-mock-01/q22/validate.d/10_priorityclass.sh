#!/usr/bin/env bash
# points: 3
# desc: PriorityClass q22-critical outranks q22-bulk and q22-standard, stays under the ceiling and never preempts
# expected: priorityclass.json json
set -uo pipefail
. /banks/_lib/checks.sh

PC=q22-critical
CEILING=1000000000

# Every PriorityClass in the cluster, in one read. The pane has to show the
# whole ranking rather than one number: what is graded here is a RELATIONSHIP,
# and the fastest way to see why a value is wrong is to see it beside the ones
# it was supposed to beat. The system classes come along for the ride, which is
# also the clearest possible statement of where the ceiling comes from.
pcs=$(kubectl get priorityclass -o json 2>/dev/null | jq '
  [ .items[]?
    | {name: .metadata.name,
       value,
       preemptionPolicy: (.preemptionPolicy // "PreemptLowerPriority"),
       globalDefault: (.globalDefault // false)} ]' 2>/dev/null)

snapshot() {
  printf '%s' "${pcs:-[]}" \
    | jq -S --arg n "$PC" '(first(.[]? | select(.name == $n)) // {}) | {preemptionPolicy: (.preemptionPolicy // null)}' 2>/dev/null
}

evidence() {
  show_pair json priorityclass.json
  show_why "$1"
}

value_of() {
  printf '%s' "${pcs:-[]}" \
    | jq -r --arg n "$1" 'first(.[]? | select(.name == $n) | .value) // empty' 2>/dev/null
}

bulk=$(value_of q22-bulk)
standard=$(value_of q22-standard)

# Do-no-harm, so a gate: the question asks for a class ABOVE these two, and
# deleting one is the cheap way to be above it. Both exist at seed, so this can
# never fire on an untouched environment and never awards a point for one.
missing=$(printf '%s' "${pcs:-[]}" \
  | jq -r '["q22-bulk", "q22-standard"] - [.[]?.name] | join(", ")' 2>/dev/null)

[ -z "$missing" ] || {
  echo "the seeded PriorityClass(es) $missing are gone from the cluster"
  show_actual json "${pcs:-null}"
  show_why "This question is graded on a relationship — q22-critical has to be worth more than the two classes that were already here — so those two have to still be here to be worth more than. Deleting one, or lowering it, is not the promotion that was asked for; the new class is what carries the higher number. Note also that a PriorityClass value is immutable once created: the API refuses an update that changes it, so the only way one of these could have changed value is a delete and a recreate. A reset re-seeds both."
  exit 1
}

exists=$(printf '%s' "${pcs:-[]}" \
  | jq -r --arg n "$PC" 'any(.[]?; .name == $n)' 2>/dev/null)

[ "$exists" = true ] || {
  echo "no PriorityClass named $PC in this cluster"
  show_actual json "${pcs:-null}"
  show_why "Everything this check grades lives on a PriorityClass called $PC, and the pane above lists the ones that exist. PriorityClasses are cluster-scoped: there is no Namespace to create this one in and none to look for it in, so 'kubectl -n reticulum get priorityclass' and 'kubectl get priorityclass' list exactly the same objects. A class under another name is invisible here, and there is no way round creating one: a priority NUMBER written straight into a Pod template does not skip this step, because the admission plugin computes spec.priority from the class name and refuses a Pod whose spec.priority disagrees with what it computed."
  exit 1
}

gd=$(printf '%s' "${pcs:-[]}" \
  | jq -r --arg n "$PC" 'first(.[]? | select(.name == $n) | .globalDefault) // false' 2>/dev/null)

# Also a gate, and the one with a blast radius beyond this Namespace: a global
# default is applied cluster-wide by the admission plugin to every Pod that
# names no class at all. False at seed and false on any class the candidate
# creates without asking for it, so it costs nothing to leave alone.
[ "$gd" != true ] || {
  echo "$PC is marked globalDefault: true, which re-ranks Pods across the whole cluster"
  show_actual json "${pcs:-null}"
  show_why "globalDefault does not mean 'the default for my workload'. There is exactly one global default per cluster, and the admission plugin stamps it onto every Pod created anywhere that names no priorityClassName — other Namespaces, other teams' workloads, add-ons. The question rules it out for that reason. What actually moves checkout-api onto this class is naming the class in that Deployment's Pod template, not making it the default for everything. To take the flag back off, edit the class with kubectl edit and set globalDefault to false; unlike value, that field can be updated in place."
  exit 1
}

val=$(printf '%s' "${pcs:-[]}" \
  | jq -r --arg n "$PC" 'first(.[]? | select(.name == $n) | .value) // "<none>"' 2>/dev/null)
pol=$(printf '%s' "${pcs:-[]}" \
  | jq -r --arg n "$PC" 'first(.[]? | select(.name == $n) | .preemptionPolicy) // "<none>"' 2>/dev/null)

# The comparison is done against the values read back from the API rather than
# against a number written into this check, so the seed can be retuned in
# setup.sh without silently inverting what is graded here.
outranks() {
  printf '%s' "${pcs:-[]}" | jq -e --arg n "$PC" --argjson ceil "$CEILING" '
    [ .[]? | select(.name == "q22-bulk" or .name == "q22-standard") | .value ] as $seeded
    | first(.[]? | select(.name == $n) | .value) as $v
    | ($v != null)
      and (($seeded | length) == 2)
      and ($seeded | all(. < $v))
      and ($v <= $ceil)' >/dev/null 2>&1
}

never_preempts() { [ "$pol" = Never ]; }

crit 2 "$PC outranks both seeded classes and stays under the ceiling" \
  "$PC has value $val; q22-bulk is ${bulk:-<none>}, q22-standard is ${standard:-<none>}, ceiling is $CEILING" \
  "Priority is a plain 32-bit integer and the ordering is the whole meaning of it: a class is 'higher' only by holding a bigger number than the classes it competes with, which is why the question names those two and does not name a target value. Both comparisons are strict — equal is not above — and the ceiling is not decoration either: system-cluster-critical is 2000000000 and system-node-critical is 2000001000, and a workload that outranks those is competing with the components that keep the cluster running. 'kubectl create priorityclass $PC --value=<n>' generates the object, and 'kubectl get priorityclass --sort-by=.value' puts the existing ones in the order you need to read to choose that number." \
  -- outranks

crit 1 "$PC never preempts" \
  "preemptionPolicy on $PC is '$pol', want Never" \
  "This is the field that decides what a higher priority DOES when the cluster is full. The default, PreemptLowerPriority, lets the scheduler evict running lower-priority Pods to make room for a Pending one — cluster-wide, since a PriorityClass is cluster-scoped and nothing confines the victims to your Namespace. Never keeps the priority as a queueing decision only: these Pods are considered ahead of lower-priority ones in the scheduling queue and wait like everybody else if nothing fits. The generator writes it — 'kubectl create priorityclass' takes --preemption-policy alongside --value — and the field is on the class itself, not on the Pods that use it, so the two existing classes already show the spelling." \
  -- never_preempts

crit_all_passed || evidence "$(crit_why)"
report "$PC ranks above the existing classes and preempts nothing"
