## Question

في ملف CNI من نوع .conflist، ما وظيفة array باسم plugins التي تضم عدة عناصر مثل cilium وportmap وbandwidth؟

## Options

- اختيار plugin حسب namespace الخاص بـ pod
- تشغيل كل plugin على عقدة مختلفة
- تعريف plugins بديلة تُستخدم عند فشل الأولى فقط
- Chaining: تشغيل plugins بالتسلسل

## Solution

**Chaining: تشغيل plugins بالتسلسل** هي الإجابة الصحيحة: ينفذ CNI chaining الـ plugins بالترتيب. ينشئ plugin الرئيسي الواجهة ويضبطها، ثم تستقبل plugins التالية prevResult وتضيف قدرات مثل `portmap` لـ hostPort و`bandwidth`.
