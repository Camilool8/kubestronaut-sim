## Question

kubectl exec montre eth0 UP avec la bonne IP, mais RIEN n'entre ni ne sort. Sur le nœud, `ip link` montre le pair veth en état LOWERLAYERDOWN. Qu'est-ce que cela indique ?

## Options

- LOWERLAYERDOWN est l'état normal
- Le pod a besoin de plus de CPU
- Le DNS est mal configuré
- L'autre extrémité de la paire veth

## Solution

**L'autre extrémité de la paire veth** est la bonne réponse : veth est un câble à deux bouts : si le bout côté hôte tombe ou quitte le bridge, le lien du pod perd sa couche physique — le « câble virtuel » est débranché. Vérifiez le bridge/CNI et recréez le pod.
