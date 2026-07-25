# Question Bank Specification (v1alpha2)

A bank lives at `banks/<bank-id>/` and contains `exam.yaml` plus one
directory per question. The conductor scans every `banks/*/exam.yaml`
into the exam catalog the UI's lobby renders; `banks/catalog.yaml` adds
coming-soon entries whose exam engine doesn't exist yet.

## exam.yaml

    apiVersion: sim.kubestronaut.dev/v1alpha2
    kind: Exam
    metadata:
      name: ckad-mock-01            # must equal directory name
      title: CKAD Mock Exam 01
      certification: CKAD           # catalog badge (CKAD/CKA/CKS/...)
      description: >-               # one-liner shown on the catalog card
        Developer-track exercises.
    spec:
      examType: hands-on            # only "hands-on" runs today; anything else
                                    # is listed in the catalog but disabled
      duration: 120m                # enforced: the facilitator auto-ends the session at 0:00
      passingScore: 66              # percent; enforced: facilitator's Results.Passed
      kubernetesVersion: "1.35"     # informational
      environment:
        provider: kind
        nodes: 2                    # informational; 1 control-plane + N-1 workers
      instances:                    # ssh targets; 1 or 2 entries, names MUST be
        - name: instance-1          # instance-1 / instance-2 — the compose topology
        - name: instance-2          # is generic so every bank runs unmodified.
                                    # (Per-bank ssh aliases, e.g. cka-1 -> instance-1,
                                    # are a possible future enhancement.)
      questions:
        - id: q01                   # directory name
          instance: instance-1          # where the candidate solves it
          domain: Application Design and Build
          weight: 5                 # informational; scoring = sum of check points

## Question directory: `banks/<bank-id>/<qid>/`

| File            | Purpose |
|-----------------|---------|
| `question.md`   | Statement shown to the candidate. Must name the instance and any artifact paths (`/opt/course/<n>/...`). |
| `setup.sh`      | Seeds pre-state. Runs inside `k8s-env` as root with admin `KUBECONFIG`. MUST be idempotent (safe to re-run). |
| `validate.d/NN_name.sh` | One scoring criterion each, run in lexical order. |
| `solution.md`   | Full walkthrough, shown after the exam. |

## Validate script contract

- Executed ON the question's instance, as root, with
  `KUBECONFIG=/home/candidate/.kube/config`.
- Header comments (parsed by the grader):
  `# points: <int>` and `# desc: <one line>`.
- Exit 0 = criterion met. Non-zero = failed. stdout = short message.
- Must be side-effect free (never mutate cluster or files).
- Must finish within 30 seconds. The facilitator runs each check under a
  30s deadline; a check still running past it is killed and scored failed
  (message: "check timed out"), regardless of what it would eventually have
  returned.

## Runtime environment provided to scripts

- `/shared/kubeconfig` — admin kubeconfig (server `https://k8s-env:6443`).
- Instances: candidate user `candidate` (password `candidate`), kubeconfig
  at `~/.kube/config`, writable `/opt/course/`, tools: kubectl, helm, yq,
  jq, vim, nano.
- `/opt/course/<n>` is pre-created on every instance for each question
  (`<n>` = the digits of the question id, e.g. `q01` → `/opt/course/1`),
  owned by `candidate`. Questions must never require creating these
  directories — candidates only write files into them, as on the real exam.
- `/banks` mounted read-only on k8s-env and instances.
- `spec.environment.allowedDomains` (optional): domain suffixes the exam
  desktop's browser may reach through the docs proxy; subdomains
  included. Omit it to inherit `allow.DefaultDomains`
  (`proxy/internal/allow/allow.go`), which is the smallest set that
  leaves the documentation sites actually usable — the docs themselves,
  `code.jquery.com` (kubernetes.io's JS is a jQuery IIFE; without it the
  search box and sidebar never wire up), the font hosts, and helm.sh's
  Algolia search hosts. Analytics and Google Programmable Search are
  deliberately excluded: with Google unreachable, kubernetes.io falls
  back to Pagefind, the search index it serves itself, which matches the
  real exam's rule that the docs search is allowed but external search
  results are not. Adding a host here widens what a candidate can reach,
  so keep it to things a documentation page genuinely needs.
