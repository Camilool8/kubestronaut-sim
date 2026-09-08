## Question

لماذا يعيد `ip netns list` على العقدة نتيجة فارغة غالباً رغم وجود عشرات pods، وما الأمر الذي يسرد network namespaces الحقيقية؟

## Options

- لأن الأمر deprecated
- لأن runtimes تنشئ netns غير مسماة؛ استخدم lsns -t net
- لأن sudo يجب أن يُستخدم مرتين
- لأن pods لا تستخدم namespaces

## Solution

**لأن runtimes تنشئ netns غير مسماة؛ استخدم lsns -t net** هي الإجابة الصحيحة: يرى `ip netns` فقط netns المسماة والمربوطة في /var/run/netns. تنشئ runtimes namespaces مجهولة مرتبطة بالعمليات، ويسردها `lsns -t net` مع PIDs لاستخدامها مع nsenter.
