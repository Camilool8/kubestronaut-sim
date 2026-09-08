## Question

Para emitir un certificado wildcard (*.example.com) mediante Let's Encrypt/ACME con cert-manager, ¿qué challenge es obligatorio?

## Options

- DNS-01 (un registro TXT _acme-challenge en DNS)
- Solo TLS-ALPN-01, en el puerto 443
- Ningún challenge; los wildcards se emiten automáticamente
- HTTP-01

## Solution

**DNS-01 (un registro TXT _acme-challenge en DNS)** es la respuesta correcta: La política de Let's Encrypt exige demostrar el control DNS para wildcards: solo `DNS-01`, que crea un TXT en _acme-challenge mediante la integración de cert-manager con el proveedor DNS (Route53, Cloudflare…). HTTP-01 solo valida hostnames exactos.
