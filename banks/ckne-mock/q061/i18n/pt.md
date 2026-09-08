## Question

Para um cluster dual-stack (IPv4 + IPv6), o que é necessário configurar?

## Options

- Apenas trocar o CNI
- Dual-stack não é suportado no Kubernetes
- Somente adicionar registros AAAA no CoreDNS
- cluster-cidr e service-cluster-ip-range com dois blocos

## Solution

**cluster-cidr e service-cluster-ip-range com dois blocos** é a resposta correta: Dual-stack exige CIDRs duplos no control plane, um CNI compatível e, por Service, o campo `ipFamilyPolicy` (SingleStack, PreferDualStack, RequireDualStack) + `ipFamilies`. Pods recebem um IP de cada família em `status.podIPs`.
