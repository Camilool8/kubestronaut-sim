# Solution 7

Everything here lives under `securityContext` and `resources`. The only
trap is which `securityContext` — there are two, and they are not
interchangeable.

```bash
k -n cygnus apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: vault-agent
  namespace: cygnus
spec:
  containers:
    - name: agent
      image: busybox:1.37
      command: ["sh", "-c", "sleep 3600"]
      securityContext:
        runAsUser: 10001
        runAsGroup: 20001
        runAsNonRoot: true
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop: ["ALL"]
      resources:
        requests:
          cpu: 100m
          memory: 64Mi
        limits:
          cpu: 500m
          memory: 128Mi
EOF

k -n cygnus wait --for=condition=Ready pod/vault-agent --timeout=120s
```

Confirm it is really running as that user, rather than trusting the spec:

```bash
k -n cygnus exec vault-agent -- id
# uid=10001 gid=20001
```

## The two securityContexts

`spec.securityContext` is the **Pod** one and applies to every container
unless overridden. `spec.containers[].securityContext` is the
**container** one. They do not hold the same fields:

| Field | Pod | Container |
|---|---|---|
| `runAsUser`, `runAsGroup`, `runAsNonRoot` | yes | yes |
| `fsGroup` | yes | no |
| `allowPrivilegeEscalation` | **no** | yes |
| `readOnlyRootFilesystem` | **no** | yes |
| `capabilities` | **no** | yes |

Putting `readOnlyRootFilesystem` at Pod level is the classic mistake:
the API rejects it outright, so you find out immediately. Putting
`runAsUser` at Pod level is fine and often preferable.

## The two "not root" settings

`runAsUser: 10001` *tells* the container which UID to use.
`runAsNonRoot: true` *refuses to start* if it would end up as UID 0 —
including when the image sets `USER root` and no `runAsUser` overrides
it. They are a belt-and-braces pair, which is why the question asks for
both: the first is intent, the second is enforcement.

## readOnlyRootFilesystem

This is the setting most likely to leave you with a crash-looping Pod,
because plenty of images write to `/tmp`, `/var/run` or `/var/cache` at
startup. `busybox` running `sleep` writes nothing, so it is safe here.
When a real image needs a writable path, mount an `emptyDir` over exactly
that path rather than giving the whole root filesystem back.
