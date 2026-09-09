## Question

تريد توجيه كل استعلامات corp.example.com إلى DNS الشركة 10.50.0.2. ماذا تعدّل في CoreDNS؟

## Options

- إضافة server block إلى Corefile
- تعديل /etc/hosts على كل عقدة
- إنشاء ExternalName Service باسم corp.example.com
- إضافة المنطقة إلى kubelet عبر --cluster-domain

## Solution

**إضافة server block إلى Corefile** هي الإجابة الصحيحة: يقبل Corefile عدة server blocks. أنشئ block مخصصاً مع plugin `forward` لتكوين stub domain. توجد أيضاً plugins مفيدة مثل `rewrite` و`hosts` و`log`.
