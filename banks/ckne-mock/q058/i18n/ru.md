## Question

Какая команда показывает записи отслеживания соединений NAT/state, чтобы определить, как преобразуется соединение pod?

## Options

- free -m
- lsof -i
- systemctl status conntrack
- conntrack -L | grep `<pod-IP>`

## Solution

**conntrack -L | grep `<pod-IP>`** — правильный ответ: `conntrack -L` выводит таблицу connection tracking ядра: исходный tuple (pod→ClusterIP) и преобразованный tuple (pod→endpoint) после DNAT kube-proxy. Это необходимо для подтверждения, что NAT Service выполняется.
