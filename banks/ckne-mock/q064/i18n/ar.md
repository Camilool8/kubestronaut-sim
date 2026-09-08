## Question

تبقى عقدة جديدة NotReady مع الحالة container runtime network not ready: cni plugin not initialized. ماذا تفحص؟

## Options

- حالة compaction والمساحة في etcd
- وجود GPU
- تشغيل DaemonSet الخاص بـ CNI على العقدة ووجود إعداد في /etc/cni/net.d/
- تشغيل kube-scheduler على العقدة

## Solution

**تشغيل DaemonSet الخاص بـ CNI على العقدة ووجود إعداد في /etc/cni/net.d/** هي الإجابة الصحيحة: تعني الحالة أن kubelet لم يجد CNI صالحاً. غالباً لم يبدأ pod الخاص بـ CNI بسبب taints أو image pull، أو لم يكتب ملف الإعداد. دون CNI لا تعمل إلا pods ذات hostNetwork.
