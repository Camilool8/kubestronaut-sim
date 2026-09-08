## Question

طُبقت NetworkPolicy من نوع default-deny egress فتوقفت pods عن حل DNS. ما أقل قاعدة تعيد name resolution؟

## Options

- السماح بـ ingress على 443
- إعادة إنشاء Service الخاصة بـ kube-dns
- السماح بـ egress إلى pods الخاصة بـ kube-dns
- نقل CoreDNS إلى hostNetwork

## Solution

**السماح بـ egress إلى pods الخاصة بـ kube-dns** هي الإجابة الصحيحة: عند deny-all egress تُحجب أيضاً استعلامات CoreDNS. اسمح بـ UDP وTCP على المنفذ 53 نحو kube-dns؛ يستخدم TCP للردود الكبيرة أو truncated.
