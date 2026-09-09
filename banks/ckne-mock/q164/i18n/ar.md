## Question

بعد restart لـ pod يبقى رسم rate(container_network_transmit_bytes_total[5m]) صحيحاً رغم reset العداد إلى صفر. لماذا؟

## Options

- تكتشف rate() resets في counter
- يمنع Prometheus restarts
- لا تُصفّر counters أبداً
- يعيد kubelet إرسال البيانات القديمة

## Solution

**تكتشف rate() resets في counter** هي الإجابة الصحيحة: تتعامل دوال PromQL مثل `rate()` و`increase()` مع resets في counters وتفترض الاستمرارية. الحساب اليدوي من القيم الخام يفشل عند كل restart. يكتشف `rate()` انخفاض القيمة (reset) ويعامل القيمة الجديدة كاستمرار من الصفر، لذا يُفضل دائماً استخدام `rate()` أو `increase()` مع counters بدلاً من طرح القيم الخام في الاستعلامات المكتوبة يدوياً.
