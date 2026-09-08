## Question

عند استخدام IPsec في Cilium، أين يُخزن المفتاح وما الممارسة التشغيلية المطلوبة؟

## Options

- داخل image الخاص بالـ agent
- في ملف على جهاز administrator
- في Secret باسم cilium-ipsec-keys
- لا يحتاج IPsec إلى مفتاح

## Solution

**في Secret باسم cilium-ipsec-keys** هي الإجابة الصحيحة: يقرأ Cilium المفتاح والخوارزمية من Secret ‏`cilium-ipsec-keys`. يجب تدوير المفاتيح تشغيلياً عبر إصدار مفتاح جديد بمعرف أعلى كي تنتقل agents دون downtime. يدير WireGuard مفاتيح العقد تلقائياً.
