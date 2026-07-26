# Milestone G/H — an environment the exam can be tested against, and a complete CKAD bank

Date: 2026-07-26

Unlike milestones A–F this has no matching file in `../plans/`: the work
ran from a session plan rather than a written phase plan. This document
is the record of what was decided and why.

## The problem

Three things, which turned out to be one thing and two others.

**The exam desktop strobed.** Resizing continuously, worse after the
candidate ssh'd anywhere.

**The first-run tour was broken.** Steps appeared with no card.

**NetworkPolicy was not enforced.** kind's default CNI, kindnet, does
routing only. The bank's one policy question could therefore be graded
only on the shape of its YAML, and — the worse half — a candidate had no
way to test their own answer, which is most of the skill. The same gap
ruled out Ingress, Helm and image-building questions, so the CKAD bank
had stalled at three questions covering three of five domains.

## Root causes

The first two were the same defect. `<main>` — the element `App` renders
between `#root` and `.screen` — had **no height rule**. Every screen root
asserts a percentage height against it (`.exam-layout` and
`.score-screen` at 100%, `.start-screen` at `min-height: 100%`), and a
percentage height resolves to `auto` the moment one ancestor in the chain
is content-sized. So:

- the lobby stopped centring,
- the score page scrolled the body instead of itself,
- and `.desktop-canvas` took its height from the noVNC canvas *inside*
  it, which noVNC's own `ResizeObserver` was watching, which made it ask
  the server to resize to match. Observe, resize, observe.

The tour was destabilised by that thrashing, but had an independent and
fatal bug: for a full-height target its "no room below, place it above"
branch resolves to `bottom: innerHeight - rect.top`, putting the card
entirely off the top of the screen. Two of its four targets were
full-height regions, so half of it was invisible by construction, and the
single `getBoundingClientRect()` was never refreshed.

## Decisions

**Fix the chain, and make the loop structurally impossible.** One rule on
`main` closes the chain. Separately, `.desktop-canvas` becomes
`position: absolute; inset: 0`, so its size can only come from its
positioned ancestor — no future ancestor regression can restart the loop.
Both are asserted in `ui/src/styles/layout.test.ts`, which reads the
source text: jsdom has no layout engine and cannot see a percentage
height that collapsed five ancestors up.

**Replace the tour rather than repair it.** `ExamIntro` draws the layout
instead of pointing at it — a static schematic with a numbered legend.
Nothing to measure, nothing that can land off-screen, renderable without
a live exam behind it, which is also why the lobby can offer it before
the clock starts.

**Calico, not kindnet + a policy add-on.** kindnet plus
`kube-network-policies` is lighter and would have enforced policy, but
Calico is the best-documented path on kind and the right base if CKS is
ever built. Cost: ~250MB and ~40s of first boot.

**Vendor the add-on manifests into the image; pre-pull their images.** A
reset re-creates the cluster, so anything fetched during bootstrap is
fetched on *every* reset and fails without a network. Manifests are baked
in with build-time assertions; their images are pulled into the DinD
cache (a named volume) and side-loaded with `kind load`. Digests are
stripped from the ingress manifest because `kind load` names images by
tag and a kubelet asked for `tag@digest` would go to the network anyway —
version pinning survives, digest pinning does not.

**Ports out to the host, but never in a check.** The chain is laptop →
published k8s-env port → kind node → ingress hostPort or NodePort. It
exists so a candidate can open their own Ingress in a browser while
learning. `docs/bank-spec.md` forbids any `validate.d` check from
depending on it: it is outside the cluster and vanishes when `SIM_BIND`
is loopback.

**`SIM_BIND` defaults to `0.0.0.0`.** Requested, so the environment can
be built on a desktop and used from a laptop. Nothing in this stack
authenticates anyone and the instances run privileged, so the README says
that plainly and names the loopback opt-out.

**Instances run privileged.** Only so podman can build images. Five
narrower sets were measured; the best clears every cgroup error and then
stops on a read-only `/proc/sys/net/ipv4/ping_group_range` that no
container-level knob reopens. Rootless podman gets further — subuid,
subgid and newuidmap are all in the image — and fails mounting `/proc`
inside its own user namespace. Recorded in `follow-ups.md` with the exact
stopping points so it is resumable.

## Grading philosophy

Where behaviour is the point, checks assert on behaviour. A policy that
denies. An Ingress the controller really routes. An adapter whose output
its neighbour can actually read. This is what the CNI work bought, and it
is why several checks look past the end state to *how* it was reached —
each of these has a shortcut producing byte-identical objects:

- q11 reads the Helm release's own values; `kubectl scale` gives the
  right replica count and the next upgrade silently reverts it.
- q12 requires a third revision and the change-cause; editing the image
  back reaches the same image and is not a rollback.
- q13 renders the kustomize overlay; hand-written manifests satisfy any
  cluster-only check.
- q22 refuses an app container that names the backend; passing it as an
  environment variable would make the request succeed while handing the
  application the knowledge the pattern exists to remove.

## The two gates

A bank is only as good as what proves it. Both run in `tests/smoke.sh`:

1. **A fresh environment scores 0.** This is the one that earns its keep.
   It caught a check that passed with no readiness probe configured at
   all, and two kinds of state surviving a reset (podman's store and the
   registry) that would have given a second attempt four free points.
2. **Every solution script scores 100%.** Run from `exam.yaml`, so a
   question added without a solution, or pointed at the wrong instance,
   fails there rather than quietly costing points.

The warm-restart assertion turned out to be a third: it caught seeded
question files being re-copied over the candidate's edits, and podman
returning from a restart corrupt rather than merely stopped.

## Deliberately not done

- **Domain weighting is skewed.** Application Design and Build holds
  28.1% of the points against a 20% target, because adapter and
  ambassador were added on top of a finished 20-question bank. All five
  domains are covered; the proportions drift. Rebalancing is a product
  call.
- **22 questions in 120 minutes** is tighter than the real exam's ratio.
- **Bank workload images** are still pulled from the internet by the kind
  nodes on every reset. Only the CNI and ingress images are pre-loaded.
- **`banks/_charts` is shared across banks**, not per-bank. Fine while one
  bank uses Helm.
