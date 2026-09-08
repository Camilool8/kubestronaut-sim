## Question

Une NetworkPolicy default-deny egress a été appliquée et les pods ne résolvent plus le DNS. Quelle règle minimale restaure la résolution ?

## Options

- Autoriser l'ingress sur le port 443
- Recréer le Service kube-dns
- Autoriser l'egress vers les pods kube-dns
- Passer CoreDNS en hostNetwork

## Solution

**Autoriser l'egress vers les pods kube-dns** est la bonne réponse : Avec un deny-all egress, même les requêtes vers CoreDNS sont bloquées — symptôme classique : `could not resolve host` partout. Autorisez UDP et TCP 53 (TCP pour les réponses volumineuses/tronquées) : namespaceSelector kube-system + podSelector k8s-app=kube-dns.
