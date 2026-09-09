## Question

عند تشغيل kube-proxy بوضع iptables، ما chain التي تمثل نقطة الدخول لاعتراض الحركة المتجهة إلى Services؟

## Options

- KUBE-NODEPORTS
- KUBE-SERVICES
- CNI-ISOLATION
- KUBE-FORWARD

## Solution

**KUBE-SERVICES** هي الإجابة الصحيحة: تحتوي chain `KUBE-SERVICES`، التي تُستدعى من PREROUTING/OUTPUT في جدول nat، قاعدة لكل Service وتنتقل إلى `KUBE-SVC-*` ثم `KUBE-SEP-*` حيث يحدث DNAT. افحصها عبر `iptables -t nat -L KUBE-SERVICES`.
