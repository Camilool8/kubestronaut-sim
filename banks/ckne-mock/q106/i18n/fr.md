## Question

En Calico, comment créer un deny explicite avec précédence sur les règles allow ?

## Options

- Le deny explicite est impossible dans tout CNI
- Des policies Calico avec action: Deny et le champ order
- Avec une annotation deny=true sur la policy native
- En supprimant le CNI

## Solution

**Des policies Calico avec action: Deny et le champ order** est la bonne réponse : Les policies Calico (GlobalNetworkPolicy/NetworkPolicy) ont un `order` et des actions Allow/Deny/Log/Pass — modèle pare-feu classique. Un Deny d'ordre bas bat les allows ultérieurs. L'API native ne sait pas faire ça ; d'où les CRD ou l'AdminNetworkPolicy en environnements régulés.
