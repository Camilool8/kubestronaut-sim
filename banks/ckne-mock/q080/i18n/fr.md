## Question

Le listener du Gateway définit hostname *.example.com et une HTTPRoute déclare hostnames [app.example.com, app.other.com]. Que se passe-t-il ?

## Options

- Les deux hostnames fonctionnent
- Seule l'intersection est servie
- Le Gateway adopte app.other.com automatiquement
- Toute la route est rejetée

## Solution

**Seule l'intersection est servie** est la bonne réponse : Le rattachement listener↔route utilise l'intersection des hostnames : seuls les noms compatibles avec le hostname du listener sont programmés (app.example.com matche le wildcard ; app.other.com est ignoré). Vérifiez le statut avec `kubectl describe httproute`.
