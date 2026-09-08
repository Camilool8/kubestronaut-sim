## Question

لماذا تعد موازنة round-robin البسيطة سيئة لحركة LLM؟

## Options

- تكلفة الطلبات متفاوتة جداً
- GPU لا يقبل أكثر من اتصال TCP واحد
- LLM لا يستخدم HTTP
- kube-proxy يمنع حركة الذكاء الاصطناعي

## Solution

**تكلفة الطلبات متفاوتة جداً** هي الإجابة الصحيحة: قد يولد طلب 10 tokens وآخر 4000، والاستجابات streaming وطويلة. تحتاج الموازنة الواعية بالـ inference إلى مراعاة الطوابير وضغط KV-cache وprefix affinity لكل replica مع timeouts مناسبة.
