## Question

Configurer sessionAffinity: ClientIP sur un Service HEADLESS a quel effet ?

## Options

- Aucun effet pratique sur le flux
- Ça transforme le Service en NodePort
- Toujours une erreur de validation
- Affinité parfaite par client

## Solution

**Aucun effet pratique sur le flux** est la bonne réponse : L'affinité est une fonction du proxy au-dessus du VIP. Le headless livre du DNS pur — le « balancer » est le résolveur/client. Configuration acceptée, effet nul : un classique d'examen.
