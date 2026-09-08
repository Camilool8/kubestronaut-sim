## Question

أي مورد في Gateway API يوجّه اتصالات TLS حسب SNI دون فك تشفيرها، ومع أي listener mode يرتبط؟

## Options

- TCPRoute مع tls: true
- HTTPRoute في Secure mode
- CertRoute مع SNI تلقائي
- TLSRoute على TLS listener في وضع Passthrough

## Solution

**TLSRoute على TLS listener في وضع Passthrough** هي الإجابة الصحيحة: يطابق `TLSRoute` قيمة SNI في ClientHello ويمرر stream المشفر كما هو إلى backend الذي ينهي TLS. يسمح ذلك بعرض عدة خدمات end-to-end TLS خلف IP واحد.
