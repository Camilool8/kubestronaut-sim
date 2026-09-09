## Question

لماذا يحسن التوجيه وفق prompt prefix مع مراعاة prefix cache latency بشكل كبير على خوادم LLM مثل vLLM؟

## Options

- يقلل حجم الاستجابة
- يضغط النموذج قبل كل طلب
- يتجنب TLS handshake بين Gateway وكل replica
- يعيد استخدام KV-cache للـ prefix ويتجنب prefill كامل

## Solution

**يعيد استخدام KV-cache للـ prefix ويتجنب prefill كامل** هي الإجابة الصحيحة: تعد مرحلة prefill مكلفة. إذا كان prefix الطويل موجوداً في KV-cache لreplica معينة، فإن إرسال المحادثة نفسها إليها يوفر إعادة الحساب. الموازنة العمياء توزع الطلبات وتهدر cache.
