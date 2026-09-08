## Question

ما المقصود بـ LoRA-aware routing في inference gateways؟

## Options

- استخدام NVIDIA GPUs فقط
- إرسال الطلب إلى replicas التي تحمل LoRA adapter المطلوب مسبقاً
- ضغط الاستجابات
- الموازنة حسب hash للـ prompt على كل replicas

## Solution

**إرسال الطلب إلى replicas التي تحمل LoRA adapter المطلوب مسبقاً** هي الإجابة الصحيحة: تعرض خوادم مثل vLLM الـ adapters المحملة. يعطي Endpoint Picker أولوية للـ replica التي تملك adapter ساخناً، لأن تبديل adapters يستهلك وقت GPU ويزيد latency لكل الطلبات في الطابور.
