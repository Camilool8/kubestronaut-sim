## Question

Pourquoi --cluster-cidr (pods) et --service-cluster-ip-range ne doivent-ils JAMAIS se chevaucher ?

## Options

- Parce que le DNS exige des plages égales
- Parce que les ClusterIPs sont virtuels
- Ils peuvent se chevaucher sans souci
- Par esthétique de configuration

## Solution

**Parce que les ClusterIPs sont virtuels** est la bonne réponse : Ce sont des plans d'adressage distincts traités par des mécanismes différents (routes/CNI vs règles DNAT). Un chevauchement fait qu'une même adresse matche tantôt les règles de Service, tantôt route vers un pod — connexions fausses et intermittentes : le pire type de bug.
