## Question

Нужно разрешить egress только к api.github.com, IP которого постоянно меняются. Какое решение поддерживает это нативно в Cilium?

## Options

- hostAliases в pod
- Нативная NetworkPolicy с полем dns
- CiliumNetworkPolicy с toFQDNs
- ipBlock со всеми диапазонами GitHub, обновляемыми вручную

## Solution

**CiliumNetworkPolicy с toFQDNs** — правильный ответ: Нативная NetworkPolicy принимает только IP/selectors. Cilium перехватывает DNS через dns proxy, узнаёт IP, разрешённые для заданного FQDN, и динамически авторизует их: policy следует за именем, а не IP. Также требуется разрешить DNS egress через rules toPorts 53.
