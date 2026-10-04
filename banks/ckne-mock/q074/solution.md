**The name references each pod's named containerPort** is correct: With `targetPort: http`, each pod defines `ports[].name: http` with any number it wants (8080, 3000…). The Service resolves it per pod — useful in migrations and rolling updates that change the app port.

Why the others are wrong:

- **It's faster** — resolution of a name to a number happens when endpoints are computed; there is no data-path speed difference.
- **It avoids conflicts with NodePort** — NodePort allocation is independent of how the container port is expressed.
- **Port names are mandatory in the Gateway API** — Gateway API `backendRefs` use a numeric `port` on the Service; port names on containers are optional everywhere.
