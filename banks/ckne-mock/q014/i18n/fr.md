## Question

Toutes les requêtes du domaine interne corp.example.com doivent aller vers le DNS d'entreprise 10.50.0.2. Que faites-vous dans CoreDNS ?

## Options

- Ajouter un bloc serveur dans le Corefile
- Éditer /etc/hosts sur chaque nœud
- Créer un Service ExternalName nommé corp.example.com
- Ajouter la zone au kubelet avec --cluster-domain

## Solution

**Ajouter un bloc serveur dans le Corefile** est la bonne réponse : Le Corefile (ConfigMap `coredns` dans kube-system) accepte plusieurs blocs serveur. Un bloc dédié avec le plugin `forward` (`corp.example.com:53 { forward . 10.50.0.2 }`) crée un stub domain. Utiles aussi : `rewrite`, `hosts`, `log`.
