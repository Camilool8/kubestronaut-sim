## Question

Quel type de Service fournit un VIP interne au cluster avec balancing L4 (TCP/UDP/SCTP), sans exposition externe ?

## Options

- NodePort
- ClusterIP
- ExternalName
- LoadBalancer

## Solution

**ClusterIP** est la bonne réponse : `ClusterIP` est le type par défaut : IP virtuelle stable, résoluble via DNS interne, balancing L4 vers les endpoints. NodePort ouvre un port sur chaque nœud ; LoadBalancer provisionne un LB externe ; ExternalName n'est qu'un CNAME.
