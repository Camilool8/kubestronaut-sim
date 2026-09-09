## Question

في أي مجلد يبحث kubelet افتراضياً عن ملفات إعداد شبكة CNI؟

## Options

- /etc/kubernetes/cni/
- /opt/cni/bin/
- /etc/cni/net.d/
- /var/lib/cni/conf/

## Solution

**/etc/cni/net.d/** هي الإجابة الصحيحة: توجد ملفات الإعداد ‎(*.conf / *.conflist)‎ في `/etc/cni/net.d/`، بينما توجد ملفات plugins التنفيذية في `/opt/cni/bin/`. إذا كان مجلد الإعداد فارغاً تبقى العقدة NotReady مع الخطأ cni plugin not initialized.
