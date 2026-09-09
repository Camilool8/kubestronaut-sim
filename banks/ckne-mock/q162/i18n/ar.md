## Question

يعرض dashboard انفجاراً في NXDOMAIN لدى CoreDNS ويشتبه الفريق بهجوم. الاستعلامات مثل api.stripe.com.default.svc.cluster.local. ما التشخيص الصحيح؟

## Options

- نفدت ذاكرة CoreDNS
- تم اختراق CoreDNS
- DNS tunneling attack
- سلوك ndots:5 طبيعي يوسع الأسماء الخارجية عبر search domains قبل الجواب الصحيح

## Solution

**سلوك ndots:5 طبيعي يوسع الأسماء الخارجية عبر search domains قبل الجواب الصحيح** هي الإجابة الصحيحة: افحص suffix في الاستعلامات الفاشلة. إذا كانت أسماء خارجية ملحقة بـ search domains فالسبب ndots وليس هجوماً. تحتاج metrics الخاصة بـ NXDOMAIN إلى هذا السياق لتجنب false alerts.
