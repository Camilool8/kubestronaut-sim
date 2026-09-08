## Question

Após reiniciar um pod, o gráfico de rate(container_network_transmit_bytes_total[5m]) daquele workload... continua correto, mesmo o counter tendo zerado. Por quê?

## Options

- A função rate() detecta resets de counter
- O Prometheus proíbe restarts
- Counters nunca zeram
- O kubelet reenvia os dados antigos

## Solution

**A função rate() detecta resets de counter** é a resposta correta: Semântica essencial do PromQL: `rate()`/`increase()` tratam resets assumindo continuidade. Fazer aritmética manual com counters brutos quebra em cada restart — erro comum em queries artesanais.
