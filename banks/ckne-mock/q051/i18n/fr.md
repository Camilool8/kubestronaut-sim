## Question

Des connexions échouent par intermittence sous charge et dmesg montre « nf_conntrack: table full, dropping packet ». Quelle métrique le confirme, et quel correctif ?

## Options

- Redémarrer le CNI règle le problème définitivement
- Comparer node_nf_conntrack_entries avec node_nf_conntrack_entries_limit
- Surveiller apiserver_request_total ; scaler l'apiserver
- Vérifier coredns_cache_hits_total ; vider le cache CoreDNS

## Solution

**Comparer node_nf_conntrack_entries avec node_nf_conntrack_entries_limit** est la bonne réponse : Chaque connexion NATée occupe une entrée conntrack. Table pleine = drops silencieux et échecs intermittents. Surveillez le ratio entries/limit dans node_exporter et augmentez `net.netfilter.nf_conntrack_max`.
