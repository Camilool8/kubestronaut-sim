# kubestronaut-sim

An open-source exam simulator for the Kubestronaut certifications, run
locally on your own machine. Sit a full exam under a real countdown, on
a real cluster, as many times as you need. Deliberately harder than the
real exams.

It is built to stay with you across the whole path rather than one
sitting: every graded attempt is kept, so you can see which domains are
still weak and how far along the five certifications you are.

Two banks ship today. **CKAD Mock Exam 01** is hands-on: 26 original
questions across all five curriculum domains, 22 drawn per attempt and
stratified to the curriculum weights every time, 120 minutes, 66% to
pass, against a two-node Kubernetes 1.35 cluster. **KCNA Mock Exam** is multiple-choice
in the real exam's shape: 97 original questions, 65 drawn per attempt
and weighted to the post-November-2025 curriculum on every draw, 90
minutes, 75% to pass, every question with a full explanation for
review. CKA, KCSA and CKS appear in the catalog as coming soon.

Hands-on questions are graded on behaviour wherever behaviour is the
point — a policy that actually denies, an Ingress the controller really
routes — not on the shape of your YAML.

## What it does not replace

This is one part of preparing, not the whole of it. It does not replace
working a problem out for yourself, the lab you build at home, or the
Linux Foundation's own training. What it adds is a timed rehearsal on a
real cluster and a score you can trust.

## Quickstart

Requires Docker Desktop (or docker + compose v2), python3, and about
9GB of free RAM. The XFCE desktop is included in that figure.

```bash
./sim doctor                 # optional preflight: RAM, disk, cgroups, tools
./sim up                     # up in seconds; pick an exam in the browser
open http://localhost:8080   # then never touch the CLI again
```

Nothing is built until you choose an exam: the app is up in seconds and
picking a certification in the browser is what creates its cluster,
narrating each phase as it goes. `./sim doctor` catches the
environmental problems that are cheaper to find before a build than
during one.

Everything after `up` happens in the browser. See [docs/cli.md](docs/cli.md)
for the full command and configuration reference.

> **There is no authentication anywhere in this stack.** Ports bind to
> all interfaces by default, so anyone who can reach port 8080 can start
> and end your exam, and the exam desktop is a real shell with
> cluster-admin. On a network you do not control:
>
> ```bash
> SIM_BIND=127.0.0.1 ./sim up
> ```
>
> See [SECURITY.md](SECURITY.md) for what is and is not defended.

## Running it for other people

`./sim up` is the reference and it is uncapped. If you want to put it in
front of a group — or in front of the internet — there is a Helm chart
in [`deploy/helm/`](deploy/helm/kubestronaut-sim) that deploys a front
door: sign-in, a capped pool of concurrent sessions with a queue, and
attempt history kept per user that outlives the environment it was made
in. Each candidate gets the whole eight-container stack as one Pod.

The simulator itself does not change to make that work — the front door
is a separate process in front of it — so nothing above is affected.
Read [docs/hosting.md](docs/hosting.md) before you deploy one: a
hands-on session runs a privileged container, and the nodes it runs on
should be ones you are willing to rebuild.

## What the exam feels like

1. **Exams** — every certification on the Kubestronaut path, with each
   live bank's duration, draw size, passing score and engine. Choosing
   one that is not loaded rebuilds the environment, so it asks first.
2. **Mode** — Training (untimed, two-tier hints, solutions on demand),
   Mastery (half the clock, no help) or Exam (the bank's duration, no
   help). Each card lists what the server will actually allow.
3. **Exam view** — a timer bar with warnings at a quarter, an eighth
   and a twenty-fourth of the attempt, the question panel, and the exam
   desktop rendered by a built-in VNC client. The terminal is already
   open; Firefox is restricted to a documentation allowlist.
4. **End** — submit early or let the timer expire. The desktop locks
   immediately and grading runs in the background.
5. **Score** — percent, pass/fail, expandable per-question checks, full
   solutions, and a New attempt button.

Anything you copy reaches the exam desktop automatically — highlight text
in a question and press ⌘C, or copy from any other app and come back to
the tab. The in-page copy needs no clipboard permission anywhere,
Firefox included, since it reads the live selection rather than the
clipboard API. Paste in the exam terminal with Ctrl+V, ⌘V, the
terminal's own Ctrl+Shift+V, or right-click → Paste. Copying in the
terminal works the same way in reverse, but only in Chrome: reading the
host clipboard automatically and writing the terminal's copy back to it
both need a gesture Firefox won't grant — the Clipboard panel is a real
click and covers both. Press `?` for the full shortcut list.

What reaches the desktop is reduced to ASCII, so an em dash arrives as a
hyphen and curly quotes arrive straight. The clipboard channel drops any
non-ASCII character outright, and a hyphen beats losing the paste.

`down` then `up` resumes your exam state, including an in-progress
session. Light and dark themes follow your system. The exam needs a
desktop-sized screen; phones get an explanation rather than a broken
layout.

## The cluster you get

A kind cluster sized by the exam you picked — `spec.environment.nodes`
in its bank decides how many nodes get built, so a bank that needs
somewhere to drain to gets one — with **Calico** rather than kindnet, so
NetworkPolicies are genuinely enforced and a policy question can be
graded on behaviour. It also carries
ingress-nginx, a local Helm repository, and a plain-HTTP registry for
the image-building questions.

Test in-cluster first — that is what the real exam expects, and what the
graders use:

```bash
kubectl -n <ns> run tmp --rm -it --restart=Never --image=nginx:alpine -- curl -m 5 <svc>
```

[docs/architecture.md](docs/architecture.md) covers the containers,
networks and boot sequence.

## Documentation

| Document | What it covers |
|---|---|
| [docs/cli.md](docs/cli.md) | `./sim` subcommands, environment variables, host ports |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Symptoms and fixes, from preflight to grading |
| [docs/architecture.md](docs/architecture.md) | Containers, networks, boot sequence, data flow |
| [docs/api.md](docs/api.md) | HTTP API for the facilitator and conductor |
| [docs/bank-spec.md](docs/bank-spec.md) | Question bank format and the validator contract |
| [docs/testing.md](docs/testing.md) | What CI enforces, and what only the smoke suite does |
| [docs/hosting.md](docs/hosting.md) | The chart, its values, and what hosted mode does differently |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Building, testing, and submitting changes |
| [SECURITY.md](SECURITY.md) | Threat model and the boundaries that exist |

## License

Code: Apache-2.0. Question banks: CC BY-SA 4.0 (see
[banks/LICENSE](banks/LICENSE)).

Not affiliated with CNCF, The Linux Foundation, or PSI. Kubernetes and
the certification names are trademarks of The Linux Foundation. The same notice, plus a real-exam comparison table, lives in
the app's About panel.
