## Question

في Calico، كيف تنشئ deny صريحاً له أولوية على قواعد allow؟

## Options

- الـ deny الصريح مستحيل في أي CNI
- Calico policies مع action: Deny وحقل order
- annotation باسم deny=true على policy الأصلية
- حذف CNI

## Solution

**Calico policies مع action: Deny وحقل order** هي الإجابة الصحيحة: تدعم سياسات Calico حقل `order` وأفعال Allow وDeny وLog وPass، مثل firewall تقليدي. تفوز سياسة Deny ذات order أقل على allow اللاحقة، وهي قدرة غير موجودة في NetworkPolicy الأصلية.
