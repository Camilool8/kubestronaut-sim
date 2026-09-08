## Question

Avec le chiffrement WireGuard nœud-à-nœud activé dans le CNI, le trafic entre deux pods du MÊME nœud est-il chiffré ?

## Options

- Non : le chiffrement couvre le trafic qui traverse le réseau ENTRE nœuds
- Oui, toujours
- Seulement pour l'UDP
- Seulement si les pods sont dans des namespaces différents

## Solution

**Non : le chiffrement couvre le trafic qui traverse le réseau ENTRE nœuds** est la bonne réponse : Le but est de protéger le trafic « sur le fil » contre l'interception réseau. Les paquets entre pods du même nœud ne passent que par la mémoire/bridge locale, jamais par le tunnel. Pour chiffrer et authentifier CHAQUE saut logique : combiner avec le mTLS du mesh.
