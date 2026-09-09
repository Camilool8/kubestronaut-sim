## Question

Внутри pod на какой адрес nameserver указывает /etc/resolv.conf при конфигурации по умолчанию (dnsPolicy: ClusterFirst)?

## Options

- Непосредственно на IP pod CoreDNS
- На ClusterIP Service kube-dns
- 127.0.0.53 (systemd-resolved)
- На resolv.conf узла, скопированный без изменений

## Solution

**На ClusterIP Service kube-dns** — правильный ответ: При `ClusterFirst` kubelet указывает ClusterIP Service `kube-dns`, заданный через `--cluster-dns`, в качестве nameserver и добавляет search-домены, например `<ns>.svc.cluster.local`, а также `ndots:5`.
