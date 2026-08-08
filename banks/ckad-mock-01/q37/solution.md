# Solution 37

## 1. A certificate for the host name

One `openssl` invocation writes both halves. `-nodes` leaves the key
unencrypted, which is what a Secret needs — a passphrase-protected key is
one nginx can never load:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout /opt/course/37/tls.key \
  -out    /opt/course/37/tls.crt \
  -subj   '/CN=sculptor.sim.local' \
  -addext 'subjectAltName=DNS:sculptor.sim.local'
```

`-x509` is what makes it a certificate rather than a signing request:
there is nobody to send a request to, so it signs itself.

## 2. The Secret

```bash
k -n sculptor create secret tls portal-tls \
  --cert=/opt/course/37/tls.crt \
  --key=/opt/course/37/tls.key
```

`create secret tls` is not a convenience — it is the only thing that
produces type `kubernetes.io/tls`, and the two data keys it writes,
`tls.crt` and `tls.key`, are the exact names ingress-nginx looks for.
Build the same Secret with `create secret generic` and it is type
`Opaque`; the API takes it, the Ingress references it, and the controller
quietly serves its own default certificate instead.

```bash
k -n sculptor get secret portal-tls
# NAME         TYPE                DATA   AGE
# portal-tls   kubernetes.io/tls   2      5s
```

## 3. The Ingress

```bash
k -n sculptor apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: portal-https
  namespace: sculptor
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - sculptor.sim.local
      secretName: portal-tls
  rules:
    - host: sculptor.sim.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: portal
                port:
                  number: 80
EOF
```

`kubectl create ingress` writes it too:

```bash
k -n sculptor create ingress portal-https --class=nginx \
  --rule="sculptor.sim.local/*=portal:80,tls=portal-tls"
```

## Verify

```bash
ip=$(k -n ingress-nginx get svc ingress-nginx-controller -o jsonpath='{.spec.clusterIP}')

k -n sculptor exec deploy/portal -- \
  curl -skv --resolve "sculptor.sim.local:443:${ip}" https://sculptor.sim.local/
# * Server certificate:
# *  subject: CN=sculptor.sim.local
# *  issuer: CN=sculptor.sim.local
# portal-ok
```

Read the `subject` line, not just the body. `Kubernetes Ingress
Controller Fake Certificate` there means the handshake succeeded on the
controller's built-in placeholder and your Secret was never loaded.

`--resolve` matters for two reasons at once. It sends the request to an
address the name does not resolve to, and it makes curl put
`sculptor.sim.local` in **SNI** — which is what nginx selects the
certificate by. A `Host:` header would route correctly and still get the
default certificate, because the certificate is chosen during the
handshake, before any header has been sent.

## Termination, not encryption end to end

The Ingress ends TLS. Behind it, the controller talks to Service `portal`
on port `80` in plain HTTP, inside the cluster network. That is what
"terminate at the Ingress" means, and it is why the backend Service in
`spec.rules` names an ordinary HTTP port.

## What each half does

| Block | Decides |
|---|---|
| `spec.rules[].host` | Which requests this rule answers, by `Host` header |
| `spec.tls[].hosts` | Which host names get a certificate, by SNI |
| `spec.tls[].secretName` | Which Secret holds it — in the Ingress's own Namespace |

The two lists are independent, and a host in `rules` alone is served over
plain HTTP. ingress-nginx also redirects HTTP to HTTPS once a host has a
`tls` entry, which is why `http://` starts answering `308` the moment
this lands.
