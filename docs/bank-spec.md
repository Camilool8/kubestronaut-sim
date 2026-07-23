# Question Bank Specification (v1alpha1)

A bank lives at `banks/<bank-id>/` and contains `exam.yaml` plus one
directory per question.

## exam.yaml

    apiVersion: sim.kubestronaut.dev/v1alpha1
    kind: Exam
    metadata:
      name: ckad-mock-01            # must equal directory name
      title: CKAD Mock Exam 01
    spec:
      duration: 120m
      passingScore: 66              # percent
      kubernetesVersion: "1.35"
      environment:
        provider: kind
        nodes: 2                    # 1 control-plane + N-1 workers
      instances:                    # ssh targets; compose services must match
        - name: ckad-1
        - name: ckad-2
      questions:
        - id: q01                   # directory name
          instance: ckad-1          # where the candidate solves it
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
- `spec.environment.allowedDomains` (optional, default
  `[kubernetes.io, helm.sh]`): domain suffixes the exam desktop's browser
  may reach through the docs proxy; subdomains included.
