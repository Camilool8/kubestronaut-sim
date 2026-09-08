## Question

Dans une règle from, quelle différence entre namespaceSelector: {} et l'omission du namespaceSelector ?

## Options

- namespaceSelector: {} (vide) matche TOUS les namespaces du cluster
- Le sélecteur vide ne matche aucun namespace (ensemble vide)
- Le sélecteur vide est une syntaxe invalide rejetée à l'admission
- Aucune différence

## Solution

**namespaceSelector: {} (vide) matche TOUS les namespaces du cluster** est la bonne réponse : Dans les sélecteurs Kubernetes, vide = tout sélectionner. `namespaceSelector: {}` ouvre à tout le cluster ; l'omettre (podSelector seul) restreint au namespace de la policy — l'inverse de l'intuition « vide = rien ». L'un des pièges les plus testés.
