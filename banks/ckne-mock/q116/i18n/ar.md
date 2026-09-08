## Question

إضافة إلى هوية workload عبر mTLS، كيف تتحقق من JWT الخاص بالمستخدم النهائي في الطلبات الواصلة إلى Service في Istio؟

## Options

- RequestAuthentication مع AuthorizationPolicy تفرض requestPrincipals
- NetworkPolicy أصلية بحقل jwt
- Basic Auth داخل ConfigMap
- التحقق في frontend فقط

## Solution

**RequestAuthentication مع AuthorizationPolicy تفرض requestPrincipals** هي الإجابة الصحيحة: تحدد `RequestAuthentication` issuer ومفاتيح JWKS للتحقق من token، لكنها وحدها ترفض tokens غير الصالحة فقط. تفرض `AuthorizationPolicy` مع `requestPrincipals: ["*"]` وجود token صالح.
