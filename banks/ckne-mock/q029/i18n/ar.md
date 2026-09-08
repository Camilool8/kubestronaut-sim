## Question

في cluster bare-metal دون cloud provider تبقى Services من نوع LoadBalancer في pending. ما الحل وما نمطا تشغيله؟

## Options

- إعادة تشغيل kube-proxy: iptables أو IPVS
- CoreDNS: forward أو rewrite
- MetalLB: وضع L2 عبر ARP/NDP أو وضع BGP
- kubeadm: init أو join

## Solution

**MetalLB: وضع L2 عبر ARP/NDP أو وضع BGP** هي الإجابة الصحيحة: يخصص MetalLB عناوين من pool ويعلنها. في **L2** تجيب عقدة واحدة عن ARP/NDP للـ VIP، وفي **BGP** تعلن العقد العنوان إلى routers مع ECMP. يوفر Cilium أيضاً BGP Control Plane وLB-IPAM.
