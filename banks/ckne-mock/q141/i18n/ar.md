## Question

Service صحيحة، port 80 إلى targetPort 8080 وendpoints جاهزة، لكن كل اتصال يعيد connection refused. داخل pod يظهر `ss -tlnp` أن العملية تستمع على 127.0.0.1:8080. ما المشكلة؟

## Options

- kube-proxy متوقف على العقدة
- التطبيق مرتبط بـ localhost فقط
- يحتاج hostNetwork
- المنفذ 8080 محجوز لـ kubelet

## Solution

**التطبيق مرتبط بـ localhost فقط** هي الإجابة الصحيحة: أكثر أسباب connection refused شيوعاً مع إعداد صحيح ظاهرياً هو bind على loopback فقط. يرسل DNAT إلى IP الخاص بـ pod، حيث لا توجد عملية تستمع. يكشف `ss -tlnp` ذلك فوراً.
