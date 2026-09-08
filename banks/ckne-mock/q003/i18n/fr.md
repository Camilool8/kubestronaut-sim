## Question

Vous devez capturer le trafic d'un pod précis directement sur le nœud, sans entrer dans le pod. Quelle est la bonne approche ?

## Options

- tcpdump -i eth0 sur le nœud, car tout le trafic des pods passe par eth0 tel quel
- Impossible ; tcpdump ne fonctionne que dans le pod
- Identifier l'interface veth du pod côté hôte et lancer tcpdump -i vethXXXX
- Lancer tcpdump -i lo, car les pods utilisent le loopback de l'hôte

## Solution

**Identifier l'interface veth du pod côté hôte et lancer tcpdump -i vethXXXX** est la bonne réponse : Chaque pod a une paire veth : une extrémité dans le netns du pod (eth0), l'autre sur l'hôte (vethXXXX). Retrouvez la paire via les index d'interfaces et capturez avec `tcpdump -i vethXXXX`. Alternative : `nsenter -t <PID> -n tcpdump`.
