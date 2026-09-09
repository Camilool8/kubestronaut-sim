## Question

Avec IPsec dans Cilium, où est stockée la clé et quelle pratique opérationnelle est requise ?

## Options

- En dur dans l'image de l'agent
- Dans un fichier sur le laptop de l'admin
- Dans le Secret cilium-ipsec-keys
- Aucune clé n'est nécessaire avec IPsec

## Solution

**Dans le Secret cilium-ipsec-keys** est la bonne réponse : Cilium lit clé/algorithme dans le Secret `cilium-ipsec-keys` (kube-system). La rotation est opérationnelle : générer une nouvelle clé avec un ID incrémenté ; les agents transitionnent sans coupure. WireGuard, lui, gère les clés par nœud automatiquement.
