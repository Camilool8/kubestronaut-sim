## Question

Какой тип Service предоставляет внутренний VIP кластера с балансировкой L4 (TCP/UDP/SCTP) без внешней публикации?

## Options

- NodePort
- ClusterIP
- ExternalName
- LoadBalancer

## Solution

**ClusterIP** — правильный ответ: `ClusterIP` — тип по умолчанию: стабильный виртуальный IP, разрешаемый внутренним DNS, с балансировкой L4 на endpoints. NodePort открывает порт на каждом узле; LoadBalancer создаёт внешний LB; ExternalName является только CNAME.
