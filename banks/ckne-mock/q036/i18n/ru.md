## Question

Как разрешить egress из pod только в подсеть 203.0.113.0/24, кроме хоста 203.0.113.9?

## Options

- Добавить хост в /etc/hosts как blackhole
- ipBlock не поддерживает исключения
- Две отдельные policies: одна allow и одна deny
- ipBlock с cidr 203.0.113.0/24 и except 203.0.113.9/32

## Solution

**ipBlock с cidr 203.0.113.0/24 и except 203.0.113.9/32** — правильный ответ: `ipBlock` принимает `cidr` и список `except`. Помните: при наличии любой egress policy всё остальное блокируется, включая DNS; отдельно разрешите порт 53 к kube-dns.
