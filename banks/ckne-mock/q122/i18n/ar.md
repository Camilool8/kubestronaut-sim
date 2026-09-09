## Question

كيف تسجل كل استعلامات DNS التي يستقبلها CoreDNS مؤقتاً لأغراض audit أو debug؟

## Options

- إضافة plugin باسم log إلى block في Corefile
- تشغيل tcpdump دائماً على كل العقد
- تفعيل audit على kube-apiserver
- لا يمكن تسجيل DNS

## Solution

**إضافة plugin باسم log إلى block في Corefile** هي الإجابة الصحيحة: يطبع plugin `log` كل استعلام مع الاسم والنوع وrcode والمدة إلى stdout لـ CoreDNS. بسبب الحجم استخدمه مؤقتاً أو لنطاق محدد، وللمراقبة المستمرة لكل pod استخدم Hubble DNS flows أو metrics.
