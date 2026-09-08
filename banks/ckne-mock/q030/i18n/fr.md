## Question

Pour exposer les réseaux de pods directement sur le réseau physique de l'entreprise (sans NAT), IPs de pods routables — quelle approche ?

## Options

- Créer un NodePort par pod
- Annoncer les pod CIDRs via BGP
- Activer hostNetwork sur tous les pods
- Augmenter ndots dans resolv.conf

## Solution

**Annoncer les pod CIDRs via BGP** est la bonne réponse : Les CNI compatibles BGP (Cilium BGP Control Plane, Calico BGP) établissent des sessions avec les routeurs et annoncent les podCIDRs de chaque nœud. Le réseau externe apprend les routes et atteint les pods directement — sans encapsulation/NAT.
