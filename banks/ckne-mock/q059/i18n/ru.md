## Question

Какая команда tcpdump захватывает только DNS-трафик pod с IP 10.0.1.5 на любом интерфейсе узла?

## Options

- tcpdump -i lo udp port 53 -c 100
- tcpdump -i any -n port 53 and host 10.0.1.5
- tcpdump -n tcp port 80 and host 10.0.1.5
- tcpdump -i eth0 icmp and host 10.0.1.5

## Solution

**tcpdump -i any -n port 53 and host 10.0.1.5** — правильный ответ: `-i any` охватывает все интерфейсы, что полезно, если veth неизвестен; `port 53` фильтрует DNS по UDP и TCP, а `host 10.0.1.5` ограничивает захват pod. Добавьте `-vvv`, чтобы видеть запрашиваемые имена и rcodes ответов.
