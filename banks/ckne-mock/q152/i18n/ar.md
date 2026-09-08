## Question

عند إعادة تشغيل BGP agent أثناء ترقية Cilium أو Calico ينقطع traffic إلى VIPs المعلنة نحو 30 ثانية. أي آليتين تقللان الأثر؟

## Options

- التحويل إلى L2 دائماً
- Graceful Restart للحفاظ على routes أثناء restart وBFD لاكتشاف الفشل بسرعة
- إضافة replicas لـ CoreDNS وkube-apiserver
- خفض MTU للنفق

## Solution

**Graceful Restart للحفاظ على routes أثناء restart وBFD لاكتشاف الفشل بسرعة** هي الإجابة الصحيحة: يميز Graceful Restart إعادة التشغيل المخطط لها ويحافظ مؤقتاً على forwarding، بينما يكشف BFD موت العقدة الحقيقي بسرعة. معاً يمنعان blackholes أثناء الترقيات ويوفران failover سريعاً.
