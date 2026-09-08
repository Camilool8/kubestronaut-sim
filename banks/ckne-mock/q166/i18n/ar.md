## Question

عميل عالي throughput إلى الوجهة نفسها يبدأ بالفشل برسالة cannot assign requested address، ويعرض `ss -s` عشرات آلاف TIME_WAIT. ما المشكلة؟

## Options

- kernel تالف
- MTU منخفضة
- DNS مفقود
- نفاد ephemeral ports

## Solution

**نفاد ephemeral ports** هي الإجابة الصحيحة: نمط فتح وإغلاق اتصال لكل طلب يستهلك منافذ المصدر بينما تبقى الاتصالات في TIME_WAIT. الحل المعماري هو connection pooling وإعادة الاستخدام، لا الاعتماد فقط على sysctl.
