## Question

تشترط الشركة أن تخرج كل حركة egress إلى API خارجي من IP ثابت لإضافته إلى firewall allow-list. ما الحل؟

## Options

- توسيع pod CIDR
- استخدام hostPort على pods
- تغيير Service إلى ExternalName
- إعداد Egress Gateway

## Solution

**إعداد Egress Gateway** هي الإجابة الصحيحة: تجمع Egress Gateways الخروج عبر عقد أو عناوين محددة. في Cilium تطبق `CiliumEgressGatewayPolicy` عملية SNAT إلى egressIP لعقدة gateway، وفي Istio تخرج الحركة عبر egress gateway الخاصة بالـ mesh.
