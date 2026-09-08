## Question

لإصدار wildcard certificate مثل *.example.com عبر Let's Encrypt وACME باستخدام cert-manager، أي challenge إلزامي؟

## Options

- DNS-01 عبر TXT باسم _acme-challenge
- TLS-ALPN-01 فقط على 443
- لا challenge للـ wildcard
- HTTP-01

## Solution

**DNS-01 عبر TXT باسم _acme-challenge** هي الإجابة الصحيحة: يتطلب إصدار wildcard إثبات التحكم في DNS، لذلك يستخدم `DNS-01` الذي ينشئ سجل TXT باسم _acme-challenge عبر تكامل cert-manager مع مزود DNS. يثبت HTTP-01 أسماء hosts محددة فقط.
