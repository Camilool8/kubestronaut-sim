## Question

Welche essenziellen Felder bilden eine cert-manager-Certificate-Ressource?

## Options

- key, cert und ca im Klartext
- host, path und backend
- secretName, dnsNames und issuerRef
- image, replicas und ports

## Solution

**secretName, dnsNames und issuerRef** ist die richtige Antwort: Das Certificate deklariert den Sollzustand; cert-manager stellt über `issuerRef` aus, schreibt Key+Cert ins Secret `secretName` und erneuert automatisch. Gateway/Ingress referenzieren dann nur das Secret.
