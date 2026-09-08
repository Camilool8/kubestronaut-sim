## Question

Le TCP sur VXLAN échoue bizarrement (handshake OK, données corrompues/bloquées). Workaround connu : `ethtool -K flannel.1 tx-checksum-ip-generic off`. Quel est le problème de fond ?

## Options

- Le kernel ne supporte pas TCP sur VXLAN
- Manque de mémoire
- MTU trop haute sur toutes les interfaces physiques
- Le checksum offload du driver calcule mal avec le VXLAN

## Solution

**Le checksum offload du driver calcule mal avec le VXLAN** est la bonne réponse : Classique de production : le checksum offload sur l'interface VXLAN produit des checksums invalides sur certaines combinaisons kernel/driver — les paquets internes arrivent corrompus. Désactiver l'offload sur le vtep corrige et explique « le ping passe, l'appli pend ».
