## Question

كيف تجعل Service داخل الكلاستر توازن إلى backend خارجي بعناوين ثابتة، مثل قاعدة بيانات 192.168.10.5:5432، مع إبقاء اسم DNS داخلي؟

## Options

- Service بلا selector مع EndpointSlice يدوي يحتوي عناوين IP الخارجية
- تشغيل قاعدة البيانات داخل StatefulSet
- هذا مستحيل دون إعادة كتابة kube-proxy
- استخدام hostNetwork

## Solution

**Service بلا selector مع EndpointSlice يدوي يحتوي عناوين IP الخارجية** هي الإجابة الصحيحة: لا تنشئ Service بلا `selector` endpoints تلقائية؛ أنشئ `EndpointSlice` يدوياً مع label ‏kubernetes.io/service-name والعناوين الخارجية. بخلاف ExternalName تحصل هنا على VIP وموازنة فعلية.
