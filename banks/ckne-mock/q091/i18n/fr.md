## Question

Vos IPs de pods sont routables dans le datacenter, mais le trafic vers le 10.0.0.0/8 interne sort encore SNATé avec l'IP du nœud. Comment préserver l'IP du pod pour ces destinations ?

## Options

- hostNetwork sur tous les pods
- Configurer l'ip-masq-agent
- Éteindre kube-proxy
- Impossible sans service mesh

## Solution

**Configurer l'ip-masq-agent** est la bonne réponse : `ip-masq-agent` contrôle le masquerade par destination : les CIDR listés en nonMasqueradeCIDRs (10.0.0.0/8) sortent avec l'IP originale du pod. Les CNI ont des équivalents (Cilium ipMasqAgent, Calico natOutgoing par IPPool).
