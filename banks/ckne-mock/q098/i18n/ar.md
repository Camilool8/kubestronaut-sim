## Question

قبل ترقية إصدار جديد تريد إرسال نسخة من حركة production الحقيقية إليه دون أن تؤثر ردوده على العملاء. أي HTTPRoute filter يفعل ذلك؟

## Options

- requestMirror أو shadow traffic
- urlRewrite
- retryPolicy
- backendRefs بوزن 50/50

## Solution

**requestMirror أو shadow traffic** هي الإجابة الصحيحة: ينفذ `RequestMirror` shadowing: يستمر backend الرئيسي في خدمة العملاء بينما يستقبل الإصدار الجديد نسخة من الطلبات لقياس الأخطاء والـ latency دون مخاطرة بالمستخدم.
