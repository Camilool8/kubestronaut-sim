## Question

Comment vérifier que le chiffrement WireGuard de Cilium est réellement actif et chiffre le trafic entre nœuds ?

## Options

- cilium status | grep Encryption
- kubectl get secrets
- Ping entre les pods
- Regarder les couleurs des pods dans le dashboard

## Solution

**cilium status | grep Encryption** est la bonne réponse : Validation en trois couches : l'agent rapporte le mode (WireGuard), `wg show` confirme des peers avec handshakes récents, et une capture sur la NIC physique ne doit montrer que de l'UDP 51871 chiffré entre IPs de pods — pas de payload en clair.
