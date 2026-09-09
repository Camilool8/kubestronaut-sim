## Question

Quelle est la différence entre ces deux règles d'ingress ?

```
(A) - from: [{namespaceSelector: X}, {podSelector: Y}]
(B) - from: [{namespaceSelector: X, podSelector: Y}]
```

## Options

- (B) est syntaxiquement invalide et rejetée par l'apiserver
- Elles sont identiques
- (A) est un OU entre les sources ; (B) est un ET (pods Y dans les namespaces X)
- (A) ne s'applique qu'à l'egress ; (B) qu'à l'ingress

## Solution

**(A) est un OU entre les sources ; (B) est un ET (pods Y dans les namespaces X)** est la bonne réponse : Des éléments séparés dans la liste `from` sont des alternatives (OU) ; des champs combinés dans le même élément sont des conditions conjointes (ET). Un tiret de plus change complètement le périmètre d'accès.
