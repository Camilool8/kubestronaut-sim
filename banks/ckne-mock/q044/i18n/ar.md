## Question

ما قيدان حقيقيان في NetworkPolicies الأصلية لـ Kubernetes؟

## Options

- لا تستطيع التصفية حسب hostname أو L7
- تنطبق فقط على kube-system
- تحتاج restart لكل pod عند كل تعديل
- لا تعمل مع TCP

## Solution

**لا تستطيع التصفية حسب hostname أو L7** هي الإجابة الصحيحة: الـ API الأصلية تعمل على L3/L4 فقط: لا قواعد FQDN أو HTTP methods ولا deny صريح أو أولوية أو logging. توسعها CNIs مثل Cilium وCalico، وتطبق التغييرات دون إعادة تشغيل pods.
