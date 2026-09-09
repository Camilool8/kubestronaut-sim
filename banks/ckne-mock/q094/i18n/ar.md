## Question

في Cilium Cluster Mesh، كيف تجعل Service متاحة ومتوازنة عبر جميع clusters المتصلة؟

## Options

- الاسم وnamespace نفسيهما مع annotation ‏service.cilium.io/global
- فتح NodePort على كل العقد
- نسخ ClusterIP يدوياً
- فقط عبر Ingress مشترك

## Solution

**الاسم وnamespace نفسيهما مع annotation ‏service.cilium.io/global** هي الإجابة الصحيحة: مع annotation الخاصة بـ global يدمج Cilium backends من كل clusters في الموازنة. ويمكن استخدام `service.cilium.io/affinity: local` لتفضيل المحلي مع failover تلقائي إلى remote.
