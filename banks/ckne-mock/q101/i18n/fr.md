## Question

Dans un cluster SANS aucune NetworkPolicy appliquée, quelle est la posture réseau par défaut entre pods ?

## Options

- Seul le trafic du même namespace est autorisé
- Seul le trafic TCP est autorisé
- Tout bloqué par défaut
- Tout autorisé entre n'importe quels pods (allow-any-any)

## Solution

**Tout autorisé entre n'importe quels pods (allow-any-any)** est la bonne réponse : Le modèle réseau de Kubernetes est ouvert par défaut : sans policies, aucune isolation. D'où la bonne pratique de commencer par un default-deny par namespace et d'autoriser explicitement le nécessaire.
