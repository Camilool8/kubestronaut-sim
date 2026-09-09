## Question

Quelles sont deux limitations réelles des NetworkPolicies natives de Kubernetes ?

## Options

- Pas de filtrage par hostname/L7
- Elles ne s'appliquent qu'au namespace kube-system
- Elles exigent le redémarrage des pods à chaque changement
- Elles ne fonctionnent pas avec TCP

## Solution

**Pas de filtrage par hostname/L7** est la bonne réponse : L'API native est L3/L4 : pas de règles FQDN, méthodes HTTP, deny explicite, priorité ni logging. Les CNI étendent cela — `toFQDNs` et règles HTTP chez Cilium, `action: Deny/Log` chez Calico. Les policies s'appliquent sans redémarrer les pods.
