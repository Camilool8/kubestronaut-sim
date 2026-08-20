# Solution 16

## Look at what you are closing

```bash
k -n hydra get pod --show-labels
# NAME                        READY   STATUS    ...   LABELS
# api-6b9c7d5f4-2h8pq         1/1     Running   ...   pod-template-hash=...,tier=api
# db-7f8d6c5b9-x4tnm          1/1     Running   ...   pod-template-hash=...,tier=db
# frontend-5c7b8d9f6-jk2vl    1/1     Running   ...   pod-template-hash=...,tier=frontend

k -n hydra get netpol
# No resources found in hydra namespace.
```

Nothing restricts anything yet, which is worth proving before you change it —
you want to know that the path you are about to protect works today:

```bash
api=$(k -n hydra get pod -l tier=api -o jsonpath='{.items[0].status.podIP}')
k -n hydra exec deploy/frontend -- wget -q -T 3 -O- "http://${api}:8080/"
# api-ok
k -n hydra exec deploy/db -- wget -q -T 3 -O- "http://${api}:8080/"
# api-ok        <- this is the one that has to stop
```

This cluster runs Calico rather than kind's default network, so a
NetworkPolicy here is enforced. That is not universal: on a cluster whose CNI
does not implement the API, every policy below is accepted by the API server,
shows up in `kubectl get netpol`, and blocks precisely nothing.

## The default

```bash
k apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: hydra
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
EOF
```

Three things do the work:

- `podSelector: {}` selects **every** Pod in the Namespace. An empty selector
  is the widest one, not the narrowest — and it is what puts `db`, which no
  other policy here mentions, behind the deny.
- `policyTypes: [Ingress, Egress]` is what flips those Pods from unrestricted
  to deny-by-default, per direction. A direction left out of this list is
  untouched no matter what is written below it.
- **No `ingress:` or `egress:` key at all.** That is the deny.

`ingress: []` means the same. `ingress: [{}]` does not — that is one rule with
no restriction on peer or port, which allows everything from everywhere, and
it is the usual way a default-deny ends up denying nothing.

Check what you just did, because half of it is the point of the question:

```bash
k -n hydra exec deploy/frontend -- wget -q -T 3 -O- "http://${api}:8080/"
# wget: download timed out            <- the application is now down

k -n hydra exec deploy/frontend -- nslookup api.hydra.svc.cluster.local
# ;; connection timed out; no servers could be reached
```

DNS went with it. That is the part people are surprised by: name resolution is
outbound traffic like any other, so `Egress` in `policyTypes` denies it too.
The symptom in a real application looks nothing like a network policy — the
process starts and then fails on every name it tries.

## The exception, inbound

```bash
k apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-ingress
  namespace: hydra
spec:
  podSelector:
    matchLabels: {tier: api}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: {tier: frontend}
      ports:
        - {protocol: TCP, port: 8080}
EOF
```

`spec.podSelector` is the destination being protected; the `podSelector` under
`from` is the source, matched by label inside this same Namespace. Naming the
source in both places is the classic swap, and it fails quietly: a policy whose
selector matches nothing never applies at all.

The `ports` list is not decoration. Drop it and this rule lets the frontend
Pods reach **every** port on the api Pods — the admin endpoint on 9090
included — while still looking narrow in a listing, because the peer is narrow.

## The exception, outbound

```bash
k apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-egress
  namespace: hydra
spec:
  podSelector:
    matchLabels: {tier: frontend}
  policyTypes: [Egress]
  egress:
    - to:
        - podSelector:
            matchLabels: {tier: api}
      ports:
        - {protocol: TCP, port: 8080}
    - to:
        - namespaceSelector:
            matchLabels: {kubernetes.io/metadata.name: kube-system}
          podSelector:
            matchLabels: {k8s-app: kube-dns}
      ports:
        - {protocol: UDP, port: 53}
        - {protocol: TCP, port: 53}
EOF
```

The second rule is the one worth reading twice.

- Its peer is **one** list entry holding two selectors, so they are ANDed:
  Pods labelled `k8s-app=kube-dns` **in** `kube-system`. Split them into two
  entries and they become an OR — every Pod in `kube-system`, plus anything
  labelled `k8s-app=kube-dns` in `hydra` — which is far wider than you meant.
- `kubernetes.io/metadata.name` is set on every Namespace by the API server,
  so it is always available for this. The DNS Pods' own label is worth
  confirming rather than remembering:

  ```bash
  k -n kube-system get pod -l k8s-app=kube-dns
  ```

- Both protocols on 53: UDP for ordinary queries, TCP for answers too large
  for one datagram.
- Name the **Pods**, not the Service address. A Service's ClusterIP is
  translated to a Pod address on the way, and the Kubernetes documentation
  leaves it undefined whether a policy is applied before or after that
  translation — so an `ipBlock` holding `10.96.0.10/32` is not something to
  rely on. The same is true of the rule above it: `podSelector` on the api
  Pods covers traffic sent to the `api` Service just as well, because what
  arrives at the far end is a Pod.

## Verify

Prove all four outcomes rather than reading the YAML back, and give every
client a timeout — a denied packet is dropped, not refused, so without one the
command sits there for over two minutes:

```bash
api=$(k -n hydra get pod -l tier=api -o jsonpath='{.items[0].status.podIP}')
db=$(k -n hydra get pod -l tier=db -o jsonpath='{.items[0].status.podIP}')

k -n hydra exec deploy/frontend -- wget -q -T 3 -O- "http://${api}:8080/"
# api-ok

k -n hydra exec deploy/frontend -- nslookup api.hydra.svc.cluster.local
# Name:      api.hydra.svc.cluster.local
# Address 1: 10.96.x.y api.hydra.svc.cluster.local

k -n hydra exec deploy/frontend -- wget -q -T 3 -O- "http://${api}:9090/"
# wget: download timed out

k -n hydra exec deploy/frontend -- wget -q -T 3 -O- "http://${db}:5432/"
# wget: download timed out

k -n hydra exec deploy/db -- wget -q -T 3 -O- "http://${api}:8080/"
# wget: download timed out
```

## Why one connection needs two policies to agree

The frontend-to-api request crosses two enforcement points, because the
default denied both directions:

| Enforced at | By | Without it |
|---|---|---|
| leaving the frontend Pod | `allow-frontend-egress` | the packet never leaves |
| arriving at the api Pod | `allow-api-ingress` | the packet arrives and is dropped |

Allowing one end and not the other produces exactly the same symptom as
allowing neither, which is why "I wrote the ingress rule and it still times
out" is the most common way this task goes wrong. `db` needs no policy of its
own: it is denied in both directions by the default and nothing makes an
exception for it.

## Reading a policy that is not working

```bash
k -n hydra get netpol
k -n hydra describe netpol allow-api-ingress
k -n hydra get pod --show-labels
```

The last one settles most of it. A `podSelector` that matches nothing does not
fail and does not warn — it simply never applies, which leaves its Pods
unrestricted rather than protected, and the traffic you meant to deny flows
exactly as it always did.
