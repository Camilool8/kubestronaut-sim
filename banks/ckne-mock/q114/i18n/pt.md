## Question

Para emitir um certificado wildcard (*.example.com) via Let's Encrypt/ACME com cert-manager, qual desafio é obrigatório?

## Options

- DNS-01 (registro TXT _acme-challenge no DNS)
- TLS-ALPN-01 apenas, na porta 443
- Nenhum desafio, wildcard é emitido automaticamente
- HTTP-01

## Solution

**DNS-01 (registro TXT _acme-challenge no DNS)** é a resposta correta: A política do Let's Encrypt exige prova de controle do DNS para wildcards: apenas `DNS-01`, que cria um TXT em _acme-challenge via integração do cert-manager com o provedor DNS (Route53, Cloudflare…). HTTP-01 valida somente hostnames exatos.
