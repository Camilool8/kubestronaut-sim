## Question

No Istio, qual recurso e modo obrigam que TODO tráfego recebido pelos workloads de um namespace seja mTLS, rejeitando conexões em texto claro?

## Options

- NetworkPolicy com campo tls
- Gateway com allowInsecure: false
- PeerAuthentication com mtls.mode: STRICT
- DestinationRule com tls: DISABLE

## Solution

**PeerAuthentication com mtls.mode: STRICT** é a resposta correta: `PeerAuthentication STRICT` (por namespace ou mesh-wide) faz os sidecars/ztunnel aceitarem apenas mTLS. O modo PERMISSIVE (padrão) aceita ambos — útil na migração, mas deve ser fechado em produção.
