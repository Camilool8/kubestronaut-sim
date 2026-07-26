# Solution 6

Both ConfigMaps come straight from `kubectl create`:

```bash
k -n atlas create configmap app-tuning \
  --from-literal=LOG_LEVEL=debug --from-literal=MAX_WORKERS=8

k -n atlas create configmap app-limits --from-file=/opt/course/6/limits.conf
```

`--from-file` pointed at a file uses the file's **basename** as the key,
so this gives you `limits.conf` for free. If the file were named
anything else you would spell the key out:

```bash
k -n atlas create configmap app-limits --from-file=limits.conf=/some/other/path
```

Check before moving on — a wrong key here is invisible until the mount
produces no file:

```bash
k -n atlas get cm app-limits -o yaml
```

Now the Pod. `envFrom` is what "without listing them one by one" is
asking for: it imports every key in the ConfigMap as an environment
variable named after the key.

```bash
k -n atlas apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: tuned
  namespace: atlas
spec:
  volumes:
    - name: limits
      configMap:
        name: app-limits
  containers:
    - name: web
      image: nginx:1.29-alpine
      envFrom:
        - configMapRef:
            name: app-tuning
      volumeMounts:
        - name: limits
          mountPath: /etc/app
          readOnly: true
EOF
```

Then read the value back **from inside the container** — that is what the
question asks for, and it is the only way to catch a ConfigMap that is
attached but not actually delivering:

```bash
k -n atlas wait --for=condition=Ready pod/tuned --timeout=120s
k -n atlas exec tuned -c web -- printenv MAX_WORKERS > /opt/course/6/max-workers
k -n atlas exec tuned -c web -- cat /etc/app/limits.conf
```

## envFrom vs env

| | Use when |
|---|---|
| `envFrom.configMapRef` | You want all the keys, named as they are |
| `env.valueFrom.configMapKeyRef` | You want one key, or a different variable name |

`envFrom` skips any key that is not a valid environment variable name and
records an event rather than failing — so if a variable is mysteriously
absent, `k -n atlas describe pod tuned` is where the reason is.
