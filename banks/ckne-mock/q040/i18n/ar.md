## Question

في Gateway API، كيف تضبط TLS termination على HTTPS listener؟

## Options

- تركيب الشهادة كـ hostPath في كل kube-proxy
- annotation باسم tls=true على Service
- في listener الخاص بـ Gateway باستخدام tls.mode: Terminate وcertificateRefs
- في HTTPRoute عبر spec.tls.cert

## Solution

**في listener الخاص بـ Gateway باستخدام tls.mode: Terminate وcertificateRefs** هي الإجابة الصحيحة: يعلن listener عن `protocol: HTTPS` و`tls.mode: Terminate` ويشير عبر `certificateRefs` إلى Secrets من نوع `kubernetes.io/tls`. إذا كانت Secret في namespace أخرى يلزم `ReferenceGrant`.
