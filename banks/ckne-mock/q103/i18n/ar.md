## Question

ما الطريقة القياسية للسماح بحركة من namespace محددة بالاسم، مثل monitoring، داخل NetworkPolicy؟

## Options

- ipBlock مع CIDR الخاص بـ namespace
- كتابة الاسم حرفياً في from.namespace
- namespaceSelector باستخدام label ‏kubernetes.io/metadata.name
- لا يمكن الاختيار بالاسم

## Solution

**namespaceSelector باستخدام label ‏kubernetes.io/metadata.name** هي الإجابة الصحيحة: تحصل كل namespace تلقائياً على label ثابت `kubernetes.io/metadata.name`. استخدمه في namespaceSelector للإشارة إلى namespace بالاسم دون labels يدوية.
