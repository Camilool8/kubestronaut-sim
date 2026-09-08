## Question

Après avoir concentré tout l'egress sur une seule egressIP, les connexions externes échouent par intermittence en pic avec « cannot assign requested address » sur le gateway. Quelle limite a été atteinte ?

## Options

- La limite DNS
- La limite de bande passante du kernel sur le nœud gateway
- La limite de pods par nœud
- Épuisement des ports source du SNAT

## Solution

**Épuisement des ports source du SNAT** est la bonne réponse : Le SNAT multiplexe tout en (egressIP, port) : le tuple (proto, srcIP, srcPort, dst) doit être unique. Une IP a ~64k ports éphémères — à l'échelle : port exhaustion. Mitigation : plusieurs egressIPs, réutilisation des connexions, timeouts plus courts.
