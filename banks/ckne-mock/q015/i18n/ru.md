## Question

Что возвращает DNS при запросе headless Service (clusterIP: None) с selector?

## Options

- CNAME-запись на kube-apiserver
- ClusterIP Service
- Всегда NXDOMAIN
- A/AAAA-записи с IP каждого готового pod, соответствующего selector

## Solution

**A/AAAA-записи с IP каждого готового pod, соответствующего selector** — правильный ответ: У headless Services нет VIP: CoreDNS отвечает IP-адресами pods. В StatefulSets каждый pod также получает стабильную запись `pod.service.ns.svc.cluster.local`, что важно для баз данных и обнаружения по идентичности.
