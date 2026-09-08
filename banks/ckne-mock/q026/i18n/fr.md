## Question

Tout le trafic egress du cluster vers une API externe doit sortir d'une IP fixe (allow-list pare-feu). Quelle solution ?

## Options

- Agrandir le pod CIDR
- Utiliser hostPort sur les pods
- Passer le Service en ExternalName
- Configurer un Egress Gateway

## Solution

**Configurer un Egress Gateway** est la bonne réponse : Les egress gateways concentrent la sortie sur des nœuds/IPs précis : en Cilium, une `CiliumEgressGatewayPolicy` fait du SNAT vers l'egressIP d'un nœud gateway ; en Istio, le trafic sort par l'egress gateway du mesh. Sinon, l'IP de sortie est celle du nœud où tourne le pod.
