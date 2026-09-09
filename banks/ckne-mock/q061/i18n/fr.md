## Question

Pour un cluster dual-stack (IPv4 + IPv6), que faut-il configurer ?

## Options

- Juste changer de CNI
- Le dual-stack n'est pas supporté dans Kubernetes
- Seulement ajouter des AAAA à CoreDNS
- cluster-cidr et service-cluster-ip-range avec deux blocs

## Solution

**cluster-cidr et service-cluster-ip-range avec deux blocs** est la bonne réponse : Le dual-stack exige des CIDR doubles dans le control plane, un CNI compatible et, par Service, le champ `ipFamilyPolicy` (SingleStack, PreferDualStack, RequireDualStack) + `ipFamilies`. Les pods reçoivent une IP de chaque famille dans `status.podIPs`.
