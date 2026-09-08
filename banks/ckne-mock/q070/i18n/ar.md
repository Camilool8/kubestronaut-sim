## Question

ما وظيفة NodeLocal DNSCache؟

## Options

- حجب الاستعلامات الخارجية
- تشغيل cache لـ DNS على كل عقدة
- استبدال CoreDNS
- خدمة سجلات PTR فقط

## Solution

**تشغيل cache لـ DNS على كل عقدة** هي الإجابة الصحيحة: يعمل NodeLocal DNSCache كـ DaemonSet يعترض الاستعلامات محلياً على عنوان link-local مثل 169.254.20.10، يجيب من cache ويرسل إلى CoreDNS عبر TCP، ما يخفف races في conntrack مع DNS عبر UDP.
