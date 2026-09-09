## Question

لجعل كل طلبات العميل نفسه تصل دائماً إلى pod نفسه عبر ClusterIP، ما إعداد Service المستخدم؟

## Options

- publishNotReadyAddresses: true
- topologyKeys
- externalTrafficPolicy: Local
- sessionAffinity: ClientIP

## Solution

**sessionAffinity: ClientIP** هي الإجابة الصحيحة: يحافظ `sessionAffinity: ClientIP` على affinity حسب عنوان المصدر، مع timeoutSeconds افتراضي 3 ساعات. هذه هي affinity الأصلية الوحيدة على L4؛ أما cookie affinity فتحتاج proxy على L7.
