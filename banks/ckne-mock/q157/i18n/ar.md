## Question

تسمح INGRESS policy بالحركة إلى pod على المنفذ 8080، لكن لا توجد egress policy تسمح بردود الاتصال. هل تعمل الاتصالات؟

## Options

- لمدة 30 ثانية فقط
- لا، يجب السماح بالرد في egress
- نعم لأن enforcement يحتفظ بحالة الاتصال
- مع UDP فقط

## Solution

**نعم لأن enforcement يحتفظ بحالة الاتصال** هي الإجابة الصحيحة: تعمل NetworkPolicies على اتصالات stateful عبر conntrack، لا على كل packet منفصلة. السماح بالاتجاه الذي يبدأ الاتصال يكفي لمرور الردود، ولا تحتاج سياسة response منفصلة.
