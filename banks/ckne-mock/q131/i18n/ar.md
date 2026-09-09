## Question

تفشل اتصالات TCP بين العقد عبر VXLAN بشكل غريب: handshake ينجح لكن البيانات تتلف أو تتوقف. الحل المعروف `ethtool -K flannel.1 tx-checksum-ip-generic off`. ما المشكلة الأساسية؟

## Options

- kernel لا يدعم TCP فوق VXLAN
- نفاد الذاكرة
- MTU عالية جداً على كل الواجهات الفيزيائية
- خطأ في حساب checksum offload مع VXLAN في بعض drivers

## Solution

**خطأ في حساب checksum offload مع VXLAN في بعض drivers** هي الإجابة الصحيحة: قد ينتج checksum offload على واجهة VXLAN checksums غير صحيحة في بعض تركيبات kernel وdriver. يؤدي تعطيله على VTEP إلى الإصلاح، ويفسر حالة ping يعمل لكن التطبيق يعلق.
