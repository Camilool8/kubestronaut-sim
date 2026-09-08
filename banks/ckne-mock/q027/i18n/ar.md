## Question

ماذا تفعل Service من نوع ExternalName؟

## Options

- تنشئ NodePort باسم مخصص
- تحتاج LoadBalancer من السحابة
- تعيد CNAME إلى اسم DNS خارجي دون proxy أو endpoints
- تعيّن IP خارجياً ثابتاً لـ pod

## Solution

**تعيد CNAME إلى اسم DNS خارجي دون proxy أو endpoints** هي الإجابة الصحيحة: `ExternalName` عبارة عن DNS فقط: تعيد الاستعلامات CNAME إلى `spec.externalName`. لا يوجد VIP أو kube-proxy أو موازنة، وهي مفيدة لتقديم خدمة خارجية باسم داخلي.
