## Question

Você precisa permitir egress apenas para api.github.com, cujos IPs mudam constantemente. Qual solução resolve isso de forma nativa no Cilium?

## Options

- hostAliases no pod
- NetworkPolicy nativa com campo dns
- CiliumNetworkPolicy com toFQDNs
- ipBlock com todos os ranges do GitHub atualizados manualmente

## Solution

**CiliumNetworkPolicy com toFQDNs** é a resposta correta: A NetworkPolicy nativa só aceita IPs/selectors. O Cilium intercepta o DNS (dns proxy), aprende os IPs resolvidos para o FQDN permitido e autoriza dinamicamente — a policy segue o nome, não o IP. Requer também liberar o egress DNS com rules toPorts 53.
