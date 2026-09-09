## Question

Quelle ressource de la Gateway API route les connexions TLS par SNI SANS les déchiffrer, et à quel mode de listener est-elle associée ?

## Options

- TCPRoute avec le champ tls: true activé
- HTTPRoute en mode Secure
- CertRoute avec SNI automatique
- TLSRoute, sur un listener TLS en mode Passthrough

## Solution

**TLSRoute, sur un listener TLS en mode Passthrough** est la bonne réponse : `TLSRoute` matche le SNI du ClientHello et transmet le flux chiffré intact au backend (qui termine le TLS). C'est le mécanisme pour exposer plusieurs services TLS de bout en bout derrière une seule IP.
