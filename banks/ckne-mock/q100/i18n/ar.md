## Question

ما الذي تحاول Topology Aware Routing تحسينه، وما المقابل المحتمل؟

## Options

- تشفير كل الحركة مقابل استهلاك CPU
- إبقاء الحركة داخل availability zone نفسها
- تقليل DNS lookups مقابل cache
- زيادة replicas مقابل الذاكرة

## Solution

**إبقاء الحركة داخل availability zone نفسها** هي الإجابة الصحيحة: تجعل topology hints كل kube-proxy يفضل endpoints في zone نفسها، ما يقلل كلفة cross-AZ والـ latency. إذا كانت endpoints غير موزعة بما يناسب الحمل قد يحدث overload محلي، وقد تعطل الآلية hints عند عدم التوازن الشديد.
