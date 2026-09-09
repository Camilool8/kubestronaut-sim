## Question

Приложение сообщает о высокой задержке между двумя сервисами. node_netstat_Tcp_RetransSegs быстро растёт на задействованных узлах. Что это означает?

## Options

- Потерю пакетов на пути — MTU/fragmentation, заполненные queues или неисправный link — вызывающую retransmissions TCP
- Медленную работу DNS
- Необходимость compaction etcd
- Недостаточное число replicas Deployment

## Solution

**Потерю пакетов на пути — MTU/fragmentation, заполненные queues или неисправный link — вызывающую retransmissions TCP** — правильный ответ: Retransmissions TCP означают потерю пакетов. Частая причина — неверный MTU при overlay, поскольку VXLAN добавляет около 50 bytes. Проверьте через `ping -M do -s 1472`, `tcpdump` и MTU CNI.
