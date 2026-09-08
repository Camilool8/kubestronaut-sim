## Question

وفق مواصفة CNI، ماذا يفعل container runtime عند إنشاء pod؟

## Options

- يرسل CRD باسم NetworkRequest إلى apiserver
- يكتب مباشرة في جداول التوجيه داخل netns
- يستدعي REST API للـ CNI عبر HTTPS
- يشغّل ملف plugin التنفيذي مع CNI_COMMAND=ADD ويمرر الإعداد عبر stdin

## Solution

**يشغّل ملف plugin التنفيذي مع CNI_COMMAND=ADD ويمرر الإعداد عبر stdin** هي الإجابة الصحيحة: CNI عقد لتشغيل ملفات تنفيذية: يشغّل runtime الـ plugin مع متغيرات مثل `CNI_COMMAND=ADD` و`CNI_NETNS` و`CNI_IFNAME` ويمرر JSON عبر stdin. يعيد plugin عناوين IP والمسارات، وتُستدعى DEL عند الحذف.
