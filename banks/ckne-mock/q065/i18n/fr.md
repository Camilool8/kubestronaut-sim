## Question

Par défaut, quelle transformation subit le trafic d'un pod vers une destination hors du cluster en quittant le nœud ?

## Options

- Aucune — l'IP du pod est toujours routable sur Internet
- Il est converti en IPv6
- SNAT/masquerade : l'IP source devient l'IP du nœud
- Le trafic est bloqué par défaut

## Solution

**SNAT/masquerade : l'IP source devient l'IP du nœud** est la bonne réponse : Les CNI masqueradent les destinations hors des CIDR du cluster (règles type MASQUERADE/KUBE-POSTROUTING) : le serveur externe voit l'IP du nœud. Ajustable (ex. `ip-masq-agent` avec nonMasqueradeCIDRs) quand les IPs de pods sont routables sur le réseau d'entreprise.
