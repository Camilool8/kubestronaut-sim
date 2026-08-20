# Solution 18

Start with what the cluster already provides, because two of the three
things this question needs are already there and only one is yours to
create:

```bash
k get ingressclass
# NAME    CONTROLLER             PARAMETERS   AGE
# nginx   k8s.io/ingress-nginx   <none>       31m

k -n phoenix get svc
# NAME   TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)    AGE
# api    ClusterIP   10.96.104.11   <none>        8080/TCP   31m
# web    ClusterIP   10.96.221.47   <none>        80/TCP     31m
```

The class name is `nginx`, and the two Services do not listen on the
same port — `api` is on `8080`, `web` on `80`. Those are the numbers the
backends have to name.

Write the Ingress. Both paths belong to the same host, so they are two
entries in one rule:

```bash
k apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: phoenix-routes
  namespace: phoenix
spec:
  ingressClassName: nginx
  rules:
    - host: q18-phoenix.sim.local
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 8080
          - path: /web
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
EOF
```

The imperative form gets there too, and is faster under exam time — but
its `pathType` is `Exact` unless the path ends in `*`, which is stripped
from the path it writes:

```bash
k -n phoenix create ingress phoenix-routes --class=nginx \
  --rule="q18-phoenix.sim.local/api*=api:8080" \
  --rule="q18-phoenix.sim.local/web*=web:80"
```

Either way, read back what landed before you move on:

```bash
k -n phoenix get ingress
# NAME             CLASS   HOSTS                   ADDRESS     PORTS   AGE
# phoenix-routes   nginx   q18-phoenix.sim.local   localhost   80      12s
```

An `ADDRESS` that stays empty is the single most useful signal here: no
controller has claimed the object, which is `ingressClassName` and
almost never anything else. The `localhost` that appears once one has is
this deployment's `--publish-status-address` and not somewhere to send a
request — the controller writes whatever it was told to write there, and
the address you can actually reach is its Service's below.

## Testing it: the host resolves nowhere

`q18-phoenix.sim.local` is not a DNS name in this cluster. Nothing
creates a record for it, and `curl http://q18-phoenix.sim.local/api`
will fail to resolve however correct your Ingress is. Do not spend exam
minutes on that lookup, and do not add the name to anything to make it
resolve — the routing does not need it.

An Ingress rule matches on the **`Host` header**, which is a string the
client sends and not something DNS produces. So address the request to
the controller and hand it the name separately:

```bash
ip=$(k -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')
echo "$ip"
# 10.96.0.9

k -n phoenix exec deploy/api -- curl -s -m 3 -H "Host: q18-phoenix.sim.local" "http://${ip}/api"
# api-ok
k -n phoenix exec deploy/api -- curl -s -m 3 -H "Host: q18-phoenix.sim.local" "http://${ip}/web"
# web-ok
```

Three details in that command are worth keeping:

- **The controller's address is a ClusterIP**, so the request has to
  come from inside the cluster. `k exec` into a Pod the question already
  runs is the cheapest way in; a Pod you create for the purpose has to
  be scheduled and pulled first, and the exam clock is running.
- **`-m 3`.** A request that reaches no backend does not always come
  back with an error — it can sit there — and a hung `curl` in a
  terminal you are timing yourself in is worse than a failed one.
- **The `Host` header, not the URL.** `--resolve
  q18-phoenix.sim.local:80:${ip}` does the same job by faking the DNS
  answer instead, and is what you would need for HTTPS, where the
  certificate is selected by SNI during the handshake and a header sent
  afterwards is too late to choose one. Over plain HTTP the header is
  enough.

## Reading the answer you get back

Each backend answers with a word of its own, so the reply names the
Service the controller chose:

| Reply | What it means |
|---|---|
| `api-ok` on `/api`, `web-ok` on `/web` | Done |
| `404 Not Found` from nginx | The request arrived and **no rule claimed it** — the host in the header does not match `spec.rules[].host`, or the path matches no entry |
| `503 Service Temporarily Unavailable` | A rule claimed it and the backend has **no endpoints** — usually the port: the Service name resolved and the number under `port` matches no port that Service publishes |
| `web-ok` on `/api` | The rules are crossed: two backends, and the path came out attached to the wrong one |
| Connection refused, or nothing at all | The address is not the controller's, or the Ingress was never admitted — check `ADDRESS` |

The `503` case is the one this question is built to produce. Copying the
first rule and changing only the path leaves `/web` pointing at port
`8080`, which `web` does not publish; the object is valid, the
controller admits it, and the route exists with nothing behind it.

## Prefix, and why the paths do not collide

`pathType` is required on every path, and the two values behave
differently enough that the wrong one is a silent failure:

- **`Exact`** matches that string and nothing else. `/api` matches
  `/api` and not `/api/`, not `/api/v1/orders`.
- **`Prefix`** matches by whole path **segments** beneath the value, so
  `/api` matches `/api`, `/api/`, and `/api/v1/orders` — but not
  `/apixyz`, because the comparison is per segment rather than per
  character.

`Prefix` is what an application usually wants, and it is what this
question asks for: a real API is not one URL.

With two prefixes under one host, the request goes to the **longest**
matching one, whatever order the paths are listed in. That is a property
of the API rather than of nginx, so ordering the rules to "get the
precedence right" is effort that changes nothing. It also means adding a
third route later cannot break an existing one unless it is longer and
more specific — which is exactly when you would want it to win.

One thing `Prefix` does not do is edit the request. ingress-nginx passes
the path through to the backend unchanged: `/api` arrives at the `api`
Pod as `/api`, not as `/`. That is why both backends here answer on
every path. An application that expects to be mounted at the root needs
the path rewritten on the way through, which is a controller-specific
annotation (`nginx.ingress.kubernetes.io/rewrite-target`) rather than
anything the Ingress API itself offers — and one of the reasons the
Gateway API exists.

## What the Ingress does not do

An Ingress is routing rules and nothing more. It does not create a
listener, an address or a Service; the controller reads it and
reconfigures the proxy it already runs. Two consequences are worth
carrying into the exam:

- The backend must be a **Service in the Ingress's own Namespace**. An
  Ingress in `phoenix` cannot name a Service in another Namespace, and
  writing one produces an object the API accepts and the controller
  cannot resolve.
- The Services stay `ClusterIP`. Publishing them does not mean changing
  their type — a `NodePort` here would open a second, unrelated way in
  and would not affect the Ingress at all.
