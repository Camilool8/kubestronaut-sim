## Question

Sur un Service LoadBalancer/NodePort, que fait externalTrafficPolicy: Local ?

## Options

- Ne forwarde que vers les endpoints locaux du nœud, en préservant l'IP du client
- Restreint l'accès aux clients du même sous-réseau
- Force le mode IPVS
- Désactive le balancing et envoie tout au premier endpoint

## Solution

**Ne forwarde que vers les endpoints locaux du nœud, en préservant l'IP du client** est la bonne réponse : Avec `Local`, un nœud ne forwarde que vers ses pods locaux — pas de SNAT, l'IP réelle du client est préservée. Les nœuds sans endpoints sortent du LB via healthCheckNodePort. Avec `Cluster` (défaut), il peut y avoir un second saut avec SNAT.
