## Question

Какой challenge обязателен для выпуска wildcard-сертификата *.example.com через Let's Encrypt/ACME с cert-manager?

## Options

- DNS-01 — TXT-запись _acme-challenge в DNS
- Только TLS-ALPN-01 на порту 443
- Challenge не нужен; wildcard выдаётся автоматически
- HTTP-01

## Solution

**DNS-01 — TXT-запись _acme-challenge в DNS** — правильный ответ: Политика Let's Encrypt требует доказательства контроля DNS для wildcard: только `DNS-01`, создающий TXT в _acme-challenge через интеграцию cert-manager с DNS provider, например Route53 или Cloudflare. HTTP-01 проверяет только точные hostnames.
