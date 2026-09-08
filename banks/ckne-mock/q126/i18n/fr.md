## Question

Un pod a été configuré avec dnsPolicy: Default. Quel est le comportement — et pourquoi le nom est-il traître ?

## Options

- Il utilise un 8.8.8.8 fixe
- Il désactive complètement le DNS
- Il hérite du resolv.conf du NŒUD
- Il utilise le DNS du cluster, comme le nom le suggère

## Solution

**Il hérite du resolv.conf du NŒUD** est la bonne réponse : Piège de nommage classique : `Default` signifie « hériter du nœud » (pas de search domains du cluster) — les Services ne se résolvent plus. La policy réellement appliquée par défaut aux pods est `ClusterFirst`.
