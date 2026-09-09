## Question

كيف تنفذ canary release يرسل 10% من الحركة إلى الإصدار الجديد باستخدام Gateway API؟

## Options

- إنشاء 10 replicas قديمة وواحدة جديدة
- sessionAffinity: Canary في Service
- backendRefs اثنان في HTTPRoute بوزنين 90 و10
- استخدام Gateway اثنين بالـ hostname نفسه

## Solution

**backendRefs اثنان في HTTPRoute بوزنين 90 و10** هي الإجابة الصحيحة: يدعم HTTPRoute تقسيم الحركة أصلياً عبر عدة `backendRefs` مع weights. ويمكن أيضاً توجيه canary حسب header أو cookie باستخدام `matches.headers` في rule منفصلة.
