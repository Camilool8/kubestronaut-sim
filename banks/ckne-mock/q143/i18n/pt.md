## Question

Num rollout, os pods novos entram no EndpointSlice como ready e IMEDIATAMENTE recebem tráfego, mas retornam 502 por ~3s. A readinessProbe está passando. Onde está a pegadinha?

## Options

- A probe valida algo raso antes de a app estar pronta
- kube-proxy é lento demais sempre
- EndpointSlices têm delay obrigatório de 3s
- 502 é normal em rollouts

## Solution

**A probe valida algo raso antes de a app estar pronta** é a resposta correta: "Pod Endpoint Availability" depende da HONESTIDADE da probe: TCP-check passa com socket aberto e app fria. Endpoints entram no balanceamento no instante em que ficam ready — a probe é o contrato.
