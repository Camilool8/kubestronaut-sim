## Question

في Istio، أي مورد يسجل خدمة خارجية مثل api.stripe.com داخل service registry للـ mesh، بما يسمح بالـ routes وTLS والسياسات على egress؟

## Options

- ServiceEntry
- EgressClass
- OutboundPolicy
- ExternalName

## Solution

**ServiceEntry** هي الإجابة الصحيحة: يضيف `ServiceEntry` hosts الخارجية إلى registry في Istio. ومع VirtualService وDestinationRule وegress gateway يمكن التحكم بالحركة ومراقبتها وتشفيرها، واستخدام REGISTRY_ONLY لمنع الوجهات غير المعلنة.
