## Question

مع PeerAuthentication بوضع PERMISSIVE يعرض dashboard أن mTLS مفعّل ويجتاز audit. ما الخطر المخفي؟

## Options

- يشفر PERMISSIVE نصف packets فقط
- STRICT يكسر TLS
- لا خطر، PERMISSIVE آمن
- يقبل PERMISSIVE أيضاً حركة plaintext

## Solution

**يقبل PERMISSIVE أيضاً حركة plaintext** هي الإجابة الصحيحة: PERMISSIVE وضع انتقال يقبل mTLS وplaintext معاً. اختبر اتصالاً من workload بلا sidecar؛ إذا دخل فلا يوجد enforcement. استخدم STRICT لكل namespace أو workload لفرض التشفير.
