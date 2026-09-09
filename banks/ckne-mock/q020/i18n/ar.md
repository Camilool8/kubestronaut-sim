## Question

HTTPRoute موجود في namespace مختلف عن Gateway ولا يعمل. ما الذي يحتاج عادة إلى تعديل؟

## Options

- الحقل listeners.allowedRoutes.namespaces في Gateway
- يجب أن تكون backend Service من نوع NodePort
- لا تعمل HTTPRoutes إلا في namespace الخاص بـ Gateway دون استثناء
- يحتاج HTTPRoute إلى hostNetwork

## Solution

**الحقل listeners.allowedRoutes.namespaces في Gateway** هي الإجابة الصحيحة: افتراضياً تكون `allowedRoutes.namespaces.from` هي `Same`. لقبول routes من namespaces أخرى استخدم `All` أو `Selector`. ولـ backends في namespace آخر تحتاج أيضاً إلى `ReferenceGrant`.
