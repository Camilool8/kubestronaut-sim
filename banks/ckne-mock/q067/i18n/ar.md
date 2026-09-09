## Question

يعمل ping بين podين، لكن اتصالات TCP على المنفذ 8080 تفشل. ما السببان الأكثر احتمالاً؟

## Options

- NetworkPolicy مقيدة على L4 أو مشكلة MTU/PMTUD
- ICMP معطل في kernel للعقدتين
- DNS متوقف في namespace
- يحتاج pod إلى صلاحيات root

## Solution

**NetworkPolicy مقيدة على L4 أو مشكلة MTU/PMTUD** هي الإجابة الصحيحة: قد تمر حزم ICMP الصغيرة في مسار يسقط البيانات الأكبر بسبب MTU، وقد تعاملها policy بشكل مختلف. اختبر عبر `nc -zv` وقارن payloads صغيرة وكبيرة وراجع سياسات L4.
