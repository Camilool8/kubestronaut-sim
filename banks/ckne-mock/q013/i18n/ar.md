## Question

ماذا يعني kube-proxy replacement في حلول CNI مثل Cilium؟

## Options

- تفويض حل Services إلى CoreDNS
- تشغيل نسختين من kube-proxy على كل عقدة
- استبدال منطق Services ببرامج eBPF دون kube-proxy
- استخدام HTTP proxy بدلاً من kube-proxy

## Solution

**استبدال منطق Services ببرامج eBPF دون kube-proxy** هي الإجابة الصحيحة: ينفذ Cilium وظائف ClusterIP وNodePort وLoadBalancer باستخدام eBPF، بما في ذلك socket-level LB وXDP، فيلغي kube-proxy وchains الخاصة بـ iptables ويحسن الأداء والتوسع. تحقق عبر `cilium status | grep KubeProxyReplacement`.
