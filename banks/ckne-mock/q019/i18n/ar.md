## Question

في Gateway API، ما التقسيم الصحيح للأدوار بين Gateway وHTTPRoute؟

## Options

- كلاهما الشيء نفسه وHTTPRoute مجرد اسم جديد
- Gateway يحدد قواعد التوجيه وHTTPRoute يحدد listeners
- Gateway يديره مسؤول البنية ويحدد listeners والعناوين
- HTTPRoute يستبدل Service وGateway يستبدل Deployment

## Solution

**Gateway يديره مسؤول البنية ويحدد listeners والعناوين** هي الإجابة الصحيحة: النموذج يفصل الشخصيات: `GatewayClass` للتنفيذ، و`Gateway` للبنية مثل listeners والمنافذ وTLS، و`HTTPRoute` للتطبيق مثل matches وfilters وbackends. يشير route إلى Gateway عبر parentRefs وإلى Services عبر backendRefs.
