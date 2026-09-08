## Question

لتتبع طلب من البداية للنهاية عبر gateway → service A → service B، ما التقنية المستخدمة وما الذي يجب تمريره؟

## Options

- ping بطوابع زمنية متزامنة عبر NTP
- SNMP polling على switches
- kubectl logs -f على كل pods
- Distributed tracing مع تمرير header باسم traceparent

## Solution

**Distributed tracing مع تمرير header باسم traceparent** هي الإجابة الصحيحة: يربط distributed tracing الـ spans في كل قفزة. من دون تمرير `traceparent` وفق W3C Trace Context تصبح spans يتيمة، فلا يمكن تحديد المكان الذي أضاف latency.
