## Question

Dans une HTTPRoute à deux backendRefs, l'un a weight: 0. Qu'arrive-t-il à ce backend ?

## Options

- Il reçoit quand même la moitié du trafic
- La route est rejetée
- weight: 0 est invalide
- Il ne reçoit AUCUNE nouvelle requête

## Solution

**Il ne reçoit AUCUNE nouvelle requête** est la bonne réponse : Poids zéro = fraction 0 du trafic. C'est volontairement valide : le backend reste « branché » pour basculer le trafic instantanément (0↔100) sans changer la structure de la route — technique de drain/préparation.
