## Question

Каковы основные компоненты Submariner для соединения кластеров?

## Options

- Broker, Gateway nodes и Lighthouse
- Hub, Spoke и Wheel
- Master, Worker и Etcd
- Ingress, Egress и Midgress

## Solution

**Broker, Gateway nodes и Lighthouse** — правильный ответ: Broker, размещённый в одном или отдельном кластере, синхронизирует endpoints; Gateway nodes устанавливают зашифрованные tunnels между кластерами, даже при пересекающихся CIDRs через Globalnet; Lighthouse разрешает `clusterset.local`, реализуя MCS API.
