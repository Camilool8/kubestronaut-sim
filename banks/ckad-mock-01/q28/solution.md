# Solution 28

**1. The Secret.** `docker-registry` is a Secret subcommand of its own,
and using it is what sets the type — there is nothing to encode by hand:

```bash
k -n equuleus create secret docker-registry registry-cred \
  --docker-server=registry:5000 \
  --docker-username=pipeline \
  --docker-password=s3cr3t-pull
```

Look at what it built. The type first, then the one entry it stored:

```bash
k -n equuleus get secret registry-cred -o jsonpath='{.type}'
# kubernetes.io/dockerconfigjson

k -n equuleus get secret registry-cred -o json | jq -r '.data[".dockerconfigjson"]' | base64 -d | jq .
```

```json
{
  "auths": {
    "registry:5000": {
      "username": "pipeline",
      "password": "s3cr3t-pull",
      "auth": "cGlwZWxpbmU6czNjcjN0LXB1bGw="
    }
  }
}
```

That is a `~/.docker/config.json` with one server in it. `auth` is
base64 of `username:password` and is what actually travels in the
`Authorization` header; `kubectl` fills it in for you.

**2. The Pod.** `imagePullSecrets` is a Pod-level list, a sibling of
`containers`:

```bash
k apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: puller
  namespace: equuleus
spec:
  imagePullSecrets:
    - name: registry-cred
  containers:
    - name: web
      image: nginx:1.29-alpine
EOF
k -n equuleus get pod puller
```

Nothing is pulled here: the tag is not `latest`, so the pull policy
defaults to `IfNotPresent`, and the image is already on the node. That is
deliberate — the exercise is the credential, and a Pod that will not
start teaches nothing about it.

## The type is the whole point

A Secret's `type` is not a label. The kubelet looks for
`kubernetes.io/dockerconfigjson` specifically, and it requires the object
to carry exactly one key, `.dockerconfigjson`, whose value is a docker
config document. The two near misses both look right and neither works:

| What you made | `type` | Result |
|---|---|---|
| `create secret generic ... --from-file=.dockerconfigjson=...` | `Opaque` | ignored; the pull is anonymous |
| `create secret docker-registry ...` | `kubernetes.io/dockerconfigjson` | used |

There is an older sibling, `kubernetes.io/dockercfg`, whose key is
`.dockercfg` and whose body is the pre-1.13 format with no `auths`
wrapper. It still works and you will not be asked for it.

A wrong or missing credential does not fail loudly at apply time. It
fails later, as `ImagePullBackOff`, and `kubectl describe pod` carries
the registry's own words in the event.

## Per Pod, or per ServiceAccount

Naming the Secret on each Pod, as here, is explicit and travels with the
manifest. The alternative attaches it to the identity instead:

```bash
k -n equuleus patch serviceaccount default \
  --type=merge -p '{"imagePullSecrets":[{"name":"registry-cred"}]}'
```

Every Pod that then runs as that ServiceAccount gets the entry merged
into its own list at admission, without any manifest mentioning it. That
is the right shape when a whole Namespace pulls from one private
registry; the per-Pod form is the right shape when one workload does.

Both are additive. A Pod may list several, and the kubelet tries each in
turn until one works.

## Why this registry is not really private

`registry:5000` in this environment is plain HTTP with no authentication
at all, so the credential above is never checked. What the question
grades is the shape of the object and the wiring, which is the part that
is the same on a registry that does check.
