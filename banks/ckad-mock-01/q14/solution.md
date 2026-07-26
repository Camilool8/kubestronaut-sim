# Solution 14

**1. The new Secret:**

```bash
k -n tucana create secret generic api-keys \
  --from-literal=apikey=vega-7731 --from-literal=apisecret=RvT2-88x
```

**2. Diagnose before editing.** The Pod is not crashing — it never starts:

```bash
k -n tucana get pod
# NAME                          READY   STATUS                       RESTARTS
# ledger-api-6d4b8f9c7d-hn2xq   0/1     CreateContainerConfigError   0

k -n tucana describe pod -l app=ledger-api | tail -5
# Error: couldn't find key DB_PASSWORD in Secret tucana/ledger-creds
```

`CreateContainerConfigError` almost always means exactly this: a
ConfigMap or Secret reference that does not resolve. `logs` gives you
nothing, because no container ever started — `describe` is the tool.

Now see what the Secret actually holds:

```bash
k -n tucana get secret ledger-creds -o jsonpath='{.data}' | jq 'keys'
# ["password", "username"]
```

So the key is `password`, and the Deployment is the thing to change.

**3. Fix the key and add the volume in one edit** — both live in the Pod
template, so a single `k edit deploy` is one rollout instead of two:

```bash
k -n tucana edit deploy ledger-api
```

```yaml
    spec:
      volumes:
        - name: api-keys
          secret:
            secretName: api-keys
            defaultMode: 0400
      containers:
        - name: api
          image: nginx:1.29-alpine
          env:
            - name: DB_PASS
              valueFrom:
                secretKeyRef:
                  name: ledger-creds
                  key: password        # was DB_PASSWORD
          volumeMounts:
            - name: api-keys
              mountPath: /etc/api
              readOnly: true
```

```bash
k -n tucana rollout status deploy ledger-api
k -n tucana exec deploy/ledger-api -- ls -l /etc/api
```

**4. Decode the password:**

```bash
k -n tucana get secret ledger-creds -o jsonpath='{.data.password}' \
  | base64 -d > /opt/course/14/ledger-password
cat /opt/course/14/ledger-password
# Qx7-plasma-42
```

`base64 -d` is the whole point of the task. Copying the value straight
out of `get secret -o yaml` writes the encoded form, and the file would
read `UXg3LXBsYXNtYS00Mg==`.

There is a shortcut worth knowing:

```bash
k -n tucana get secret ledger-creds -o go-template='{{.data.password | base64decode}}'
```

## defaultMode reads back as 256

`0400` is octal; the API stores it as the decimal `256`, so
`get -o yaml` shows `defaultMode: 256`. Same value, and both are accepted
on input — but write `0400` in YAML and it *must* have the leading zero,
or you have asked for decimal 400, which is not a valid mode.

## Secrets are not secret from anyone with read access

`base64` is encoding, not encryption: anyone who can `get secret` can
read the value, and that is by design. What Secrets buy over ConfigMaps
is that they can be RBAC'd separately, are not written to the node's disk
in plain text, and stay out of `describe` output. Whether they are
encrypted at rest is a cluster-level setting, not a property of the
object.
