## Question

Какой источник данных следует использовать для аудита того, КАКОЙ сетевой трафик действительно прошёл или был заблокирован между workloads?

## Options

- Logs kube-scheduler
- Flow logs datapath (Hubble, Calico, VPC flow logs)
- kubectl get events
- Audit log kube-apiserver уровня RequestResponse

## Solution

**Flow logs datapath (Hubble, Calico, VPC flow logs)** — правильный ответ: Частая путаница: audit logs apiserver регистрируют операции API. Для сетевого трафика нужны flow logs CNI/datapath — source, destination, port, verdict, policy — которые можно экспортировать в SIEM.
