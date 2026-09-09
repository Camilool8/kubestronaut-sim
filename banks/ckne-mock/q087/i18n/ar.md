## Question

يرسل العملاء اسم النموذج في JSON body مثل {"model": "llama-3"}. لماذا يمثل ذلك مشكلة للـ gateways التقليدية وما الحل؟

## Options

- لا مشكلة؛ gateways تقرأ JSON أصلياً
- تغيير البروتوكول إلى UDP
- استخدام NodePort
- توجّه gateways حسب path وheader وSNI لا حسب body

## Solution

**توجّه gateways حسب path وheader وSNI لا حسب body** هي الإجابة الصحيحة: لا يفحص التوجيه التقليدي payload. تقوم Body-Based Routing extension عبر Envoy ext-proc بتحليل JSON وتحويل قيمة model إلى header، ثم تستخدم HTTPRoute أو InferencePool التوجيه العادي.
