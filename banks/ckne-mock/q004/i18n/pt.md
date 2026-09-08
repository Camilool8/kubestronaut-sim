## Question

Dentro de um pod, o /etc/resolv.conf aponta o nameserver para qual endereço, na configuração padrão (dnsPolicy: ClusterFirst)?

## Options

- O IP do CoreDNS pod diretamente
- O ClusterIP do Service kube-dns
- 127.0.0.53 (systemd-resolved)
- O resolv.conf do nó, copiado sem alterações

## Solution

**O ClusterIP do Service kube-dns** é a resposta correta: Com `ClusterFirst`, o kubelet injeta o ClusterIP do Service `kube-dns` (definido em `--cluster-dns`) como nameserver, mais search domains como `<ns>.svc.cluster.local` e `ndots:5`.
