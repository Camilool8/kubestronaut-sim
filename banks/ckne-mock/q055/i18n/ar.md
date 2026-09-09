## Question

إذا لم يتوفر kubectl exec، كيف تدخل network namespace الخاص بـ pod من العقدة لأغراض debug؟

## Options

- إعادة تشغيل kubelet مع --debug-netns
- تعديل /etc/network/interfaces للعقدة وإعادة التحميل
- استخدام crictl inspect للحصول على PID ثم nsenter -t `<PID>` -n
- SSH مباشرة إلى IP الخاص بـ pod

## Solution

**استخدام crictl inspect للحصول على PID ثم nsenter -t `<PID>` -n** هي الإجابة الصحيحة: يوفر `crictl ps` و`crictl inspect` رقم PID، ثم يشغل `nsenter -t PID -n` أوامر مثل ip وss وtcpdump داخل netns باستخدام أدوات المضيف.
