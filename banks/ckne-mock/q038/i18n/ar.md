## Question

لتشفير كل حركة pod-to-pod بين العقد بشفافية ومن دون تعديل التطبيقات، ما ميزة CNI التي تفعّلها؟

## Options

- kube-proxy بوضع IPVS
- NetworkPolicy بحقل encrypt: true
- تشفير WireGuard أو IPsec في CNI
- TLS في CoreDNS

## Solution

**تشفير WireGuard أو IPsec في CNI** هي الإجابة الصحيحة: يوفر Cilium وCalico تشفيراً شفافاً بين العقد عبر WireGuard أو IPsec. يحمي ذلك الحركة على الشبكة بين العقد، ويكمل mTLS على مستوى التطبيق ولا يستبدله.
