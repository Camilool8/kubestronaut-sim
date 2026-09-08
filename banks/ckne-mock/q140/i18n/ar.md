## Question

يدخل CoreDNS في CrashLoopBackOff بعد التثبيت ويعرض Loop ... detected. ما السبب المعتاد على عقد تستخدم systemd-resolved؟

## Options

- RBAC ناقص لـ ServiceAccount الخاص بـ CoreDNS
- image تالفة في registry
- resolv.conf للعقدة يشير إلى 127.0.0.53
- عدد replicas كبير

## Solution

**resolv.conf للعقدة يشير إلى 127.0.0.53** هي الإجابة الصحيحة: يكتشف plugin `loop` دورة forward إلى local stub ثم العودة إلى CoreDNS. تُحل المشكلة بضبط `--resolv-conf` في kubelet أو الخيار المكافئ ليشير إلى ملف resolv صحيح.
