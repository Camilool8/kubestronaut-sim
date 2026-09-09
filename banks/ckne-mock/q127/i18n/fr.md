## Question

Quelle est la vraie différence entre hostPort (sur le pod) et un Service NodePort ?

## Options

- Ils sont identiques
- NodePort ne marche que dans le cloud
- hostPort est plus sûr et balance mieux
- hostPort n'ouvre le port QUE sur le nœud du pod

## Solution

**hostPort n'ouvre le port QUE sur le nœud du pod** est la bonne réponse : `hostPort` lie pod↔nœud (via CNI portmap ; les collisions de ports limitent le scheduling) et ne balance pas ; NodePort est ouvert par kube-proxy sur TOUS les nœuds et balance vers les endpoints. Les confondre produit « marche sur un nœud, échoue sur les autres ».
