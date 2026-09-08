## Question

أي نوع Service يوفر VIP داخلياً للكلاستر مع موازنة L4 لـ TCP/UDP/SCTP دون تعريض خارجي؟

## Options

- NodePort
- ClusterIP
- ExternalName
- LoadBalancer

## Solution

**ClusterIP** هي الإجابة الصحيحة: `ClusterIP` هو النوع الافتراضي: عنوان افتراضي ثابت يُحل عبر DNS الداخلي ويوازن على مستوى L4 إلى endpoints. يفتح NodePort منفذاً على كل عقدة، بينما ينشئ LoadBalancer موازناً خارجياً وExternalName مجرد CNAME.
