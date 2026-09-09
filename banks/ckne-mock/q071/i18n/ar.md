## Question

في Corefile الخاص بـ CoreDNS، ماذا يفعل السطر `cache 30` داخل server block؟

## Options

- يخزن الردود في cache لمدة تصل إلى 30 ثانية ويخفف الحمل على upstream
- يحدد كل pod بـ 30 استعلاماً
- يرفع TTL لكل السجلات إلى 30 دقيقة
- ينشئ 30 replica من CoreDNS

## Solution

**يخزن الردود في cache لمدة تصل إلى 30 ثانية ويخفف الحمل على upstream** هي الإجابة الصحيحة: يخزن plugin `cache` الردود الناجحة والسلبية حتى المدة المحددة مع احترام TTL الأقل. يعد من أهم إعدادات أداء DNS إلى جانب عدد replicas مناسب لـ CoreDNS.
