## Question

После миграции Calico с VXLAN на IPIP межузловой трафик pod перестал работать ТОЛЬКО в облаке. Какова вероятная причина?

## Options

- IPIP использует IP-протокол 4, который часто блокируется cloud security group или firewall, разрешающими только TCP/UDP/ICMP
- MTU самостоятельно увеличилась
- IPIP больше не существует
- kube-proxy не поддерживает IPIP

## Solution

**IPIP использует IP-протокол 4, который часто блокируется cloud security group или firewall, разрешающими только TCP/UDP/ICMP** — правильный ответ: У IPIP нет TCP/UDP-порта: это IP-протокол номер 4. Security group, фильтрующие только TCP/UDP, могут молча его отбрасывать. Разрешите protocol 4 или вернитесь к VXLAN, который использует UDP 4789/8472.
