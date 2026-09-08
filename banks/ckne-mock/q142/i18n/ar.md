## Question

أي سجل DNS ينشئه Kubernetes لـ POD منفرد دون Service، وما صيغته؟

## Options

- pod-name.cluster.local
- عنوان IP بشرطات مثل 10-244-1-5.default.pod.cluster.local
- pods.default.svc
- لا تُنشأ أي سجلات لـ pods

## Solution

**عنوان IP بشرطات مثل 10-244-1-5.default.pod.cluster.local** هي الإجابة الصحيحة: توجد صيغة `a-b-c-d.ns.pod.cluster.local` لكنها تتضمن IP نفسه، لذلك لا توفر اكتشافاً مستقراً. للاكتشاف الثابت استخدم headless Service، غالباً مع StatefulSet.
