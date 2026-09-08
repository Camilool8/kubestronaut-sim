## Question

يعرض kubectl get svc الخدمة، لكن `kubectl get endpointslices -l kubernetes.io/service-name=my-svc` لا يعيد endpoints. ما السبب الأكثر شيوعاً؟

## Options

- ClusterIP مستخدم من Service أخرى
- يحتاج CoreDNS إلى restart
- selector الخاص بـ Service لا يطابق labels الخاصة بـ pods
- تفتقد Service annotation خاصة بـ endpoints

## Solution

**selector الخاص بـ Service لا يطابق labels الخاصة بـ pods** هي الإجابة الصحيحة: غالباً يعني غياب endpoints عدم تطابق `spec.selector` مع labels الخاصة بـ pods، أو وجود pods في namespace آخر، أو عدم وجود pod جاهز. قارن عبر `kubectl get pods --show-labels`.
