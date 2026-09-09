## Question

ما دور GatewayClass في Gateway API؟

## Options

- تعريف implementation أو controller الذي ينشئ Gateways فعلياً
- تجميع HTTPRoutes حسب الإصدار
- تعريف شهادات TLS
- استبدال IngressClass إلزامياً في كل الكلاستر

## Solution

**تعريف implementation أو controller الذي ينشئ Gateways فعلياً** هي الإجابة الصحيحة: `GatewayClass` مورد cluster-scoped يحدد من ينفذ Gateway عبر `controllerName`. يمكن أن يملك الكلاستر classes متعددة، مثل internal وexternal وmesh، ويشير كل Gateway إلى واحدة منها.
