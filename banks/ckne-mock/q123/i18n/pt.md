## Question

Para medir disponibilidade e latência fim-a-fim de endpoints (de fora para dentro), simulando a experiência do usuário, qual abordagem é usada?

## Options

- Monitoramento sintético com Blackbox Exporter
- Somente logs dos pods
- kubectl get events a cada minuto via cron
- Aumentar as réplicas do Prometheus e do Grafana

## Solution

**Monitoramento sintético com Blackbox Exporter** é a resposta correta: Métricas internas não capturam falhas de DNS público, LB externo ou certificado expirado. Probes sintéticos testam o caminho completo em intervalos regulares — o `probe_success`/`probe_duration_seconds` do Blackbox Exporter vira o SLI de disponibilidade externa.
