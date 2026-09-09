## Question

في Service من نوع LoadBalancer أو NodePort، ماذا يفعل externalTrafficPolicy: Local؟

## Options

- يوجّه فقط إلى endpoints المحلية على العقدة ويحافظ على IP العميل
- يقصر الوصول على عملاء الشبكة الفرعية نفسها
- يفرض وضع IPVS
- يعطل الموازنة ويرسل كل شيء لأول endpoint

## Solution

**يوجّه فقط إلى endpoints المحلية على العقدة ويحافظ على IP العميل** هي الإجابة الصحيحة: مع `Local` توجّه العقدة فقط إلى pods المحلية، فلا يحدث SNAT ويُحفظ IP الحقيقي للعميل. تُزال العقد التي لا تملك endpoints من LB عبر healthCheckNodePort. أما `Cluster` فقد يضيف قفزة ثانية مع SNAT.
