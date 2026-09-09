## Question

CoreDNS part en CrashLoopBackOff juste après l'installation, en loggant « Loop ... detected ». Cause typique sur des nœuds avec systemd-resolved ?

## Options

- RBAC manquant pour le ServiceAccount de CoreDNS
- Une image corrompue dans le registry interne
- Le resolv.conf du nœud pointe vers 127.0.0.53
- Trop de répliques

## Solution

**Le resolv.conf du nœud pointe vers 127.0.0.53** est la bonne réponse : CoreDNS forwarde vers le stub local, qui renvoie vers CoreDNS — boucle infinie détectée par le plugin `loop`. Correctif : pointer le kubelet vers le vrai fichier avec `--resolv-conf=/run/systemd/resolve/resolv.conf`.
