## Question

Sur bare-metal, vous créez le Gateway et il reste avec une ADDRESS vide et Programmed: False indéfiniment. Les HTTPRoutes sont correctes. Que manque-t-il ?

## Options

- Annoter le Gateway avec la static-ip du nœud master
- La HTTPRoute doit précéder le Gateway
- Il manque un fournisseur de VIP (LB-IPAM/MetalLB) pour l'adresse
- Redémarrer l'apiserver

## Solution

**Il manque un fournisseur de VIP (LB-IPAM/MetalLB) pour l'adresse** est la bonne réponse : Même racine que le classique « LoadBalancer pending » : l'implémentation du Gateway demande une adresse, et sur bare-metal personne ne répond. LB-IPAM/MetalLB allouent l'IP ; L2 ou BGP l'annoncent.
