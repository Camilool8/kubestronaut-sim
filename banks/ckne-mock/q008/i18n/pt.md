## Question

O comando `dig app.default.svc.cluster.local` funciona dentro do pod, mas `dig app` falha. O que devemos verificar primeiro?

## Options

- A versão do kernel do nó
- As entradas search e ndots no /etc/resolv.conf do pod
- Se o pod tem hostNetwork habilitado no spec
- Se o kube-proxy está em modo IPVS ou iptables

## Solution

**As entradas search e ndots no /etc/resolv.conf do pod** é a resposta correta: Nomes curtos dependem dos `search` domains (ex.: `default.svc.cluster.local svc.cluster.local`) e de `ndots:5`. Se dnsPolicy/dnsConfig foi alterado, ou o pod está em outro namespace, o nome curto não expande para o FQDN correto.
