## Question

Für ein Wildcard-Zertifikat (*.example.com) via Let's Encrypt/ACME mit cert-manager — welche Challenge ist Pflicht?

## Options

- DNS-01 (TXT-Record _acme-challenge im DNS)
- Nur TLS-ALPN-01, auf Port 443
- Keine Challenge, Wildcards werden automatisch ausgestellt
- HTTP-01

## Solution

**DNS-01 (TXT-Record _acme-challenge im DNS)** ist die richtige Antwort: Let's-Encrypt-Policy verlangt für Wildcards den Nachweis der DNS-Kontrolle: nur `DNS-01`, das per cert-manager-Integration mit dem DNS-Provider (Route53, Cloudflare …) ein TXT bei _acme-challenge setzt. HTTP-01 validiert nur exakte Hostnames.
