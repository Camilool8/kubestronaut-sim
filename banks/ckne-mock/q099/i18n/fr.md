## Question

Dans une topologie Istio multi-cluster à réseaux distincts (pas de pod-à-pod direct), quel composant fait passer le trafic de services entre clusters ?

## Options

- Un NodePort par service ouvert dans tous les clusters
- Un east-west gateway dédié expose les services entre clusters (mTLS)
- Un kubectl port-forward permanent
- Un VPN sur les laptops des développeurs

## Solution

**Un east-west gateway dédié expose les services entre clusters (mTLS)** est la bonne réponse : Quand les pods de clusters différents ne se joignent pas directement, Istio route le trafic inter-clusters via des east-west gateways (LoadBalancer dédié), en gardant le mTLS et une découverte d'endpoints unifiée entre réseaux.
