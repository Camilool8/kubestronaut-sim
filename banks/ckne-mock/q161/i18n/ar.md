## Question

طُبقت AuthorizationPolicy ذات spec فارغة تماماً ({}) على namespace prod. ما التأثير؟

## Options

- تسجل فقط دون حجب
- validation error
- تسمح بكل شيء لأن spec فارغة
- تحجب كل الحركة في namespace

## Solution

**تحجب كل الحركة في namespace** هي الإجابة الصحيحة: وجود ALLOW AuthorizationPolicy لا تطابق شيئاً يعني أن لا شيء مسموح، وهي طريقة deny-all شائعة في Istio. قارنها بـ NetworkPolicy ذات `ingress: [{}]` التي تسمح بكل شيء؛ للفراغ معنًى معاكس.
