## Question

Avec VXLAN et des interfaces de nœud en MTU 1500, quel réglage évite fragmentation/pertes des gros paquets ?

## Options

- La MTU du CNI moins l'overhead du tunnel (ex. 1450)
- Réduire le nombre de répliques
- Monter la MTU des pods à 9000
- Désactiver TCP et n'utiliser qu'UDP dans les pods

## Solution

**La MTU du CNI moins l'overhead du tunnel (ex. 1450)** est la bonne réponse : L'en-tête VXLAN consomme ~50 octets ; si le pod émet des trames de 1500, le paquet encapsulé dépasse la MTU physique et est jeté. Réglez la MTU du CNI (champ `mtu`/auto-détection) à 1450 ou activez les jumbo frames (9000) sur le réseau physique.
