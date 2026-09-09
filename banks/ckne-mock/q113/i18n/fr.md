## Question

Quels champs essentiels composent une ressource Certificate de cert-manager ?

## Options

- key, cert et ca en clair
- host, path et backend
- secretName, dnsNames et issuerRef
- image, replicas et ports

## Solution

**secretName, dnsNames et issuerRef** est la bonne réponse : Le Certificate déclare l'état désiré ; cert-manager émet via `issuerRef`, écrit clé+cert dans le Secret `secretName` et renouvelle automatiquement. Le Gateway/Ingress ne fait ensuite que référencer le Secret.
