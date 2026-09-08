## Question

Dans la Gateway API, comment configurer la terminaison TLS sur un listener HTTPS ?

## Options

- Monter le certificat en hostPath dans chaque kube-proxy
- Via une annotation tls=true sur le Service
- Sur le listener du Gateway, avec tls.mode: Terminate et certificateRefs
- Sur l'HTTPRoute, champ spec.tls.cert

## Solution

**Sur le listener du Gateway, avec tls.mode: Terminate et certificateRefs** est la bonne réponse : Le listener déclare `protocol: HTTPS`, `tls.mode: Terminate` et `certificateRefs` vers des Secrets `kubernetes.io/tls`. Un Secret dans un autre namespace exige un `ReferenceGrant`.
