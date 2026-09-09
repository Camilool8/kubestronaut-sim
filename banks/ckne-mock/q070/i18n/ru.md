## Question

Каково назначение NodeLocal DNSCache?

## Options

- Блокировать внешние запросы
- Запускать DNS cache на каждом узле
- Заменить CoreDNS
- Обслуживать только PTR-записи

## Solution

**Запускать DNS cache на каждом узле** — правильный ответ: NodeLocal DNSCache в виде DaemonSet перехватывает запросы на самом узле через link-local IP, например 169.254.20.10, отвечает из cache и использует TCP к CoreDNS, уменьшая классические races conntrack с DNS/UDP.
