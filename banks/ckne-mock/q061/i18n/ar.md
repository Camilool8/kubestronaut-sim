## Question

ما الذي يجب ضبطه لكلاستر dual-stack يعمل بـ IPv4 وIPv6؟

## Options

- تبديل CNI فقط
- لا يدعم Kubernetes dual-stack
- إضافة سجلات AAAA إلى CoreDNS فقط
- تحديد blockين في cluster-cidr وservice-cluster-ip-range

## Solution

**تحديد blockين في cluster-cidr وservice-cluster-ip-range** هي الإجابة الصحيحة: يتطلب dual-stack مجالين في control plane وCNI متوافقاً، ومع كل Service حقلي `ipFamilyPolicy` و`ipFamilies`. تحصل pods على عنوان من كل عائلة في `status.podIPs`.
