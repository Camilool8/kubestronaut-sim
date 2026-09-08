## Question

Une NetworkPolicy créée dans le namespace « prod » peut-elle sélectionner et isoler des pods du namespace « dev » ?

## Options

- Seulement si le CNI est Calico
- Oui, avec l'annotation cross-namespace
- Non : la NetworkPolicy est namespacée
- Oui, avec namespaceSelector

## Solution

**Non : la NetworkPolicy est namespacée** est la bonne réponse : Le `spec.podSelector` sélectionne des cibles UNIQUEMENT dans le namespace de la policy. Le `namespaceSelector` n'apparaît que dans les règles from/to (sources/destinations autorisées), jamais pour choisir qui est isolé. Pour la portée cluster : AdminNetworkPolicy ou CRD du CNI.
