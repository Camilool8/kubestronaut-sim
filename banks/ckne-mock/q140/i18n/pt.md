## Question

O CoreDNS entra em CrashLoopBackOff logo após instalar, com log "Loop ... detected". Qual é a causa típica em nós com systemd-resolved?

## Options

- Falta de RBAC para o ServiceAccount do CoreDNS
- Imagem corrompida no registry interno
- O resolv.conf do nó aponta para 127.0.0.53
- Excesso de réplicas

## Solution

**O resolv.conf do nó aponta para 127.0.0.53** é a resposta correta: O plugin `loop` existe exatamente para detectar esse ciclo: forward → stub local → CoreDNS de novo. A flag `--resolv-conf` do kubelet (ou config equivalente) resolve.
