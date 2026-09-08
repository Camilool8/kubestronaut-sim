## Question

Comment logger TOUTES les requêtes DNS reçues par CoreDNS, pour un audit/debug temporaire ?

## Options

- Ajouter le plugin log au bloc du Corefile
- tcpdump permanent sur tous les nœuds
- Activer l'audit sur le kube-apiserver
- Le logging DNS est impossible

## Solution

**Ajouter le plugin log au bloc du Corefile** est la bonne réponse : Le plugin `log` imprime chaque requête (nom, type, rcode, durée) sur stdout — lisible via `kubectl logs -n kube-system -l k8s-app=kube-dns`. Vu le volume, à utiliser temporairement ou de façon ciblée (`log example.com`) ; pour un audit continu par pod, préférez les métriques/flows DNS de Hubble.
