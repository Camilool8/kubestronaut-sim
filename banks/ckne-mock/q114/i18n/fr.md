## Question

Pour émettre un certificat wildcard (*.example.com) via Let's Encrypt/ACME avec cert-manager, quel challenge est obligatoire ?

## Options

- DNS-01 (enregistrement TXT _acme-challenge dans le DNS)
- TLS-ALPN-01 seulement, sur le port 443
- Aucun, le wildcard est émis automatiquement
- HTTP-01

## Solution

**DNS-01 (enregistrement TXT _acme-challenge dans le DNS)** est la bonne réponse : La politique Let's Encrypt exige la preuve du contrôle DNS pour les wildcards : uniquement `DNS-01`, qui crée un TXT à _acme-challenge via l'intégration de cert-manager avec le fournisseur DNS (Route53, Cloudflare…). HTTP-01 ne valide que des hostnames exacts.
