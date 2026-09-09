## Question

Qual comando do Hubble mostra, em tempo real, apenas os fluxos DESCARTADOS e o motivo (ex.: Policy denied)?

## Options

- hubble observe --verdict DROPPED
- kubectl logs cilium
- hubble encrypt --all --follow
- hubble delete flows --verdict ALL

## Solution

**hubble observe --verdict DROPPED** é a resposta correta: `hubble observe --verdict DROPPED` lista cada drop com origem→destino, porta e razão (Policy denied, CT: connection tracking, unsupported L3...). É o caminho mais rápido para descobrir qual NetworkPolicy está bloqueando um fluxo.
