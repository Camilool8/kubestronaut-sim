**secretName, dnsNames and issuerRef** is correct: The Certificate declares the desired state; cert-manager issues via `issuerRef`, writes key+cert to the `secretName` Secret and renews automatically. The Gateway/Ingress then just references the Secret.

Why the others are wrong:

- **key, cert and ca in plain text** — cert-manager generates the key and obtains the certificate itself; plain-text key material in the resource would defeat its purpose.
- **host, path and backend** — those are Ingress routing fields, not certificate fields.
- **image, replicas and ports** — those describe a Deployment; a Certificate is a declaration, not a workload.
