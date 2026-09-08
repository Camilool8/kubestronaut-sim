## Question

Pour autoriser le trafic du pod frontend (10.244.3.7) vous avez créé une règle ipBlock avec 10.244.3.7/32. Ça a marché aujourd'hui et cassé demain. Pourquoi ?

## Options

- ipBlock expire en 24 h et doit être renouvelé
- Un CIDR /32 est invalide dans les règles de NetworkPolicy
- Le frontend a besoin de hostNetwork pour être sélectionnable
- Les IPs de pods sont éphémères et peuvent arriver SNATées ; utilisez des selectors

## Solution

**Les IPs de pods sont éphémères et peuvent arriver SNATées ; utilisez des selectors** est la bonne réponse : Les policies entre workloads doivent utiliser l'identité (labels), pas les adresses. La doc elle-même restreint ipBlock aux IPs externes au cluster — double risque : IPs qui tournent et NAT sur le chemin. Entre pods : podSelector/namespaceSelector.
