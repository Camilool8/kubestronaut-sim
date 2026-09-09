## Question

Какой самый новый backend kube-proxy создан для замены режима iptables с лучшей производительностью и более современным API ядра?

## Options

- socketd
- ebtables
- nftables
- tc

## Solution

**nftables** — правильный ответ: Режим `nftables`, получивший статус GA в Kubernetes 1.33, использует API-преемник iptables с более эффективным обновлением правил и лучшей производительностью в кластерах с большим числом Services. eBPF в Cilium остаётся альтернативой вне kube-proxy.
