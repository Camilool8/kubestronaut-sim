## Question

После применения default-deny egress NetworkPolicy pods перестали разрешать DNS-имена. Какое минимальное правило восстанавливает разрешение имён?

## Options

- Разрешить ingress на порт 443
- Пересоздать Service kube-dns
- Разрешить egress к pods kube-dns
- Перевести CoreDNS на hostNetwork

## Solution

**Разрешить egress к pods kube-dns** — правильный ответ: При deny-all egress блокируются даже запросы к CoreDNS; типичный симптом — `could not resolve host` для всех имён. Разрешите UDP и TCP порт 53, поскольку TCP используется для больших или усечённых ответов.
