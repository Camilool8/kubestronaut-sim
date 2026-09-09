## Question

Dans un mesh Istio multi-cluster (multi-primary), les workloads du cluster A ne font pas confiance aux certificats du cluster B (erreurs TLS). Quelle exigence d'identité a été oubliée ?

## Options

- Partager la même root CA / trust domain
- Utiliser le même namespace dans les deux
- Couper temporairement le mTLS entre les clusters
- Attribuer des IPs publiques à tous les pods du mesh

## Solution

**Partager la même root CA / trust domain** est la bonne réponse : L'identité fédérée exige une racine commune : chaque cluster avec sa propre CA auto-générée = deux îlots de confiance. Émettez des intermédiaires depuis la même root (ou fédération SPIRE) avant de connecter les meshes.
