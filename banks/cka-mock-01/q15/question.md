Namespace `lacerta` publishes a small shop through the cluster's ingress-nginx
controller. Deployment `storefront` is exposed inside the cluster by ClusterIP
Service `storefront` on port `80`, Deployment `checkout` by ClusterIP Service
`checkout` on port `8080`, and Ingress `lacerta-legacy` serves both under one
host name, terminating TLS with the Secret `lacerta-tls`:

| Host | Path (prefix) | Backend |
|---|---|---|
| `q15-lacerta.sim.local` | `/store` | `storefront` port `80` |
| `q15-lacerta.sim.local` | `/checkout` | `checkout` port `8080` |

Move that routing onto the Gateway API, then retire the Ingress. The cluster
registers GatewayClass `sim`.

1. Create a Gateway named `lacerta-gateway` in Namespace `lacerta` on
   GatewayClass `sim`, with a **single** listener: protocol `HTTPS` on port
   `443`, for host name `q15-lacerta.sim.local`, terminating TLS with the
   Secret `lacerta-tls` that is already in the Namespace. Do not create a
   second certificate.
2. Create an HTTPRoute named `lacerta-routes` in Namespace `lacerta`, attached
   to that Gateway, serving the same host name and preserving both paths as
   prefix matches: `/store` to Service `storefront` port `80`, and
   `/checkout` to Service `checkout` port `8080`.
3. Once the new path answers, delete Ingress `lacerta-legacy`.

Leave the two Deployments, their Services and the Secret exactly as they are.

`q15-lacerta.sim.local` resolves nowhere in this cluster and nothing here will
add a record for it. Over plain HTTP you would hand the name to the proxy in a
`Host:` header; over TLS you cannot. The name is chosen during the handshake,
in SNI, and this controller closes a connection whose SNI matches no listener
with `unrecognized name` long before any header is read.

So point the client at the Gateway's own address and let it take the name from
the URL. That address is a ClusterIP, so the request has to come from inside
the cluster:

```bash
addr=$(k -n lacerta get gateway lacerta-gateway -o jsonpath='{.status.addresses[*].value}')
echo "$addr"

k -n lacerta exec deploy/storefront -- curl -sSk -m 5 \
  --resolve "q15-lacerta.sim.local:443:${addr}" \
  "https://q15-lacerta.sim.local/store"
```

`storefront` answers `storefront-ok` and `checkout` answers `checkout-ok`, so
the reply names the backend you reached. The certificate is self-signed and no
client here trusts it, which is what `-k` is for.
