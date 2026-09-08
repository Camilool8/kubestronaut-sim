## Question

أي مورد في Istio ينفذ تفويض L7، مثل السماح فقط لـ ServiceAccount باسم frontend باستدعاء GET /api على backend؟

## Options

- RBAC Role وRoleBinding
- PodSecurityPolicy
- NetworkPolicy أصلية بحقل httpRules
- AuthorizationPolicy مع from.source.principals وto.operation

## Solution

**AuthorizationPolicy مع from.source.principals وto.operation** هي الإجابة الصحيحة: تقيّم `AuthorizationPolicy` هوية mTLS أو SPIFFE principal والطريقة والمسار وheaders، فتقدم تفويض L7 لكل workload. NetworkPolicy الأصلية تقتصر على L3/L4، وRBAC يتحكم في API لا في حركة الخدمات.
