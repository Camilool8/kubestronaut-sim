## Question

في bare metal أنشأت Gateway لكنها تبقى ADDRESS فارغة وProgrammed: False رغم صحة HTTPRoutes. ما المفقود؟

## Options

- annotation بـ static IP للعقدة الرئيسية
- يجب إنشاء HTTPRoute قبل Gateway
- مزود VIP مثل LB-IPAM أو MetalLB لتخصيص العنوان
- إعادة تشغيل apiserver

## Solution

**مزود VIP مثل LB-IPAM أو MetalLB لتخصيص العنوان** هي الإجابة الصحيحة: مثل LoadBalancer في حالة pending، تطلب implementation الخاصة بـ Gateway عنواناً ولا يوجد cloud provider يقدمه. يخصص LB-IPAM أو MetalLB الـ IP، ثم يعلنه L2 أو BGP.
