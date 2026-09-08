## Question

Quais são os componentes principais do Submariner para conectar clusters?

## Options

- Broker, Gateway nodes e Lighthouse
- Hub, Spoke e Wheel
- Master, Worker e Etcd
- Ingress, Egress e Midgress

## Solution

**Broker, Gateway nodes e Lighthouse** é a resposta correta: O Broker (num cluster ou dedicado) sincroniza os endpoints; Gateway nodes estabelecem os túneis criptografados entre clusters (inclusive com CIDRs sobrepostos, via Globalnet); o Lighthouse resolve `clusterset.local` implementando a MCS API.
