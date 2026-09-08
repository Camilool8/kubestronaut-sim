## Question

Quelle opération CNI est appelée à la suppression d'un pod — et que se passe-t-il si le nœud reboote AVANT ?

## Options

- CNI DEL ; sans elle, des leases d'IP restent orphelins dans l'IPAM
- CNI FLUSH ; etcd retire l'IP
- Aucune ; le kernel nettoie toujours tout seul
- CNI REMOVE ; rien ne se passe

## Solution

**CNI DEL ; sans elle, des leases d'IP restent orphelins dans l'IPAM** est la bonne réponse : La runtime appelle `CNI_COMMAND=DEL` à la suppression. Les crashes peuvent sauter cette étape — origine des leases fantômes dans `/var/lib/cni/networks` et du « no IP addresses available » des semaines plus tard.
