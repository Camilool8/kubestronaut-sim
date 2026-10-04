**DNS-01 (a TXT record _acme-challenge in DNS)** is correct: Let's Encrypt policy requires proof of DNS control for wildcards: only `DNS-01`, which creates a TXT at _acme-challenge via cert-manager's integration with the DNS provider (Route53, Cloudflare…). HTTP-01 validates exact hostnames only.

Why the others are wrong:

- **TLS-ALPN-01 only, on port 443** — TLS-ALPN-01 validates a single hostname by serving a special certificate on port 443; Let's Encrypt does not accept it for wildcards.
- **No challenge, wildcards are issued automatically** — every certificate needs a challenge; wildcards need the strongest one because they cover names that do not exist yet.
- **HTTP-01** — HTTP-01 proves control of one host via an HTTP path; Let's Encrypt refuses it for wildcard names.
