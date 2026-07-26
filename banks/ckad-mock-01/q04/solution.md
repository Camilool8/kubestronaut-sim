# Solution 4

Generate the CronJob rather than typing it — `--dry-run=client` plus an
edit is faster than remembering where `jobTemplate` sits:

```bash
k -n vega create cronjob log-rotate --image=busybox:1.37 \
  --schedule="*/5 * * * *" --dry-run=client -o yaml \
  -- sh -c "date; echo rotated" > 4-cronjob.yaml
```

The generator gives you the schedule, the image and the command. The four
remaining settings have to be added by hand:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: log-rotate
  namespace: vega
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid        # add: never overlap a running job
  successfulJobsHistoryLimit: 2    # add
  failedJobsHistoryLimit: 1        # add
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure # add: generator emits Never
          containers:
            - name: rotate         # rename: generator uses the cronjob name
              image: busybox:1.37
              command: ["sh", "-c", "date; echo rotated"]
```

`concurrencyPolicy` is the one people miss. Its default is `Allow`, which
is exactly what "must never overlap" forbids. `Replace` would also
prevent overlap, but by killing the running Job — the wording asks for
the run to be skipped, which is `Forbid`.

Now the Job. `kubectl create job` takes no `--completions`, so write it:

```bash
k -n vega apply -f - <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: backfill
  namespace: vega
spec:
  completions: 3
  parallelism: 2
  backoffLimit: 2
  template:
    spec:
      restartPolicy: OnFailure
      containers:
        - name: worker
          image: busybox:1.37
          command: ["sh", "-c", "sleep 2; echo backfilled"]
EOF
```

Wait for it, then record the count:

```bash
k -n vega wait --for=condition=Complete job/backfill --timeout=120s
k -n vega get job backfill -o jsonpath='{.status.succeeded}' > /opt/course/4/backfill-succeeded
```

Check what you wrote — `jsonpath` emits no trailing newline, which is
fine here, but a stray `echo` or a copied `kubectl get` header is not:

```bash
cat /opt/course/4/backfill-succeeded
```

## Why these settings

| Field | Default | Why the question pins it |
|---|---|---|
| `concurrencyPolicy` | `Allow` | Overlapping runs of a rotation job corrupt what they rotate |
| `successfulJobsHistoryLimit` | 3 | Job objects and their Pods accumulate forever otherwise |
| `parallelism` | 1 | Without it, 3 completions run strictly one after another |
| `backoffLimit` | 6 | A job that will never succeed should stop retrying sooner |
