## Question

ما هي exemplars في Prometheus وكيف تساعد في تشخيص latency الشبكة؟

## Options

- dashboards جاهزة في Grafana
- تنبيهات email مع charts
- replicas احتياطية لـ Prometheus
- عينات داخل histogram buckets تحمل trace IDs

## Solution

**عينات داخل histogram buckets تحمل trace IDs** هي الإجابة الصحيحة: تربط exemplars metrics بـ traces. عند رؤية ارتفاع p99 في Grafana يمكن فتح exemplar للـ bucket البطيء والانتقال إلى trace محددة في Tempo أو Jaeger، فتربط metrics بالـ traces والـ logs.
