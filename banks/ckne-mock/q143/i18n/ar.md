## Question

أثناء rollout تدخل pods الجديدة EndpointSlice بحالة ready وتتلقى الحركة فوراً، لكنها تعيد 502 لمدة نحو 3 ثوان رغم نجاح readinessProbe. أين الفخ؟

## Options

- تفحص probe شيئاً سطحياً قبل أن يجهز التطبيق فعلياً
- kube-proxy بطيء دائماً
- لدى EndpointSlice تأخير إلزامي 3 ثوان
- أخطاء 502 طبيعية أثناء rollout

## Solution

**تفحص probe شيئاً سطحياً قبل أن يجهز التطبيق فعلياً** هي الإجابة الصحيحة: تعتمد جاهزية endpoint على صدق probe. قد ينجح TCP check لأن socket مفتوح بينما التطبيق لم يكتمل warm-up. بمجرد ready يدخل pod الموازنة فوراً؛ readinessProbe هي عقد الجاهزية.
