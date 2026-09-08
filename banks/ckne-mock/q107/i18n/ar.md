## Question

ماذا تضيف AdminNetworkPolicy أو ANP مقارنة بـ NetworkPolicy التقليدية؟

## Options

- firewall للإنترنت فقط
- تستبدل RBAC لحركة الشبكة
- نطاق على مستوى الكلاستر وأولوية وأفعال Allow/Deny/Pass
- لا شيء، هي مجرد إعادة تسمية

## Solution

**نطاق على مستوى الكلاستر وأولوية وأفعال Allow/Deny/Pass** هي الإجابة الصحيحة: توفر ANP قيوداً إدارية لا يستطيع أصحاب namespaces تجاوزها، بينما تحدد BANP الوضع الافتراضي عندما لا تحسم سياسات المستخدم القرار. ترتيب التقييم هو ANP ثم NetworkPolicy ثم BANP.
