## Question

داخل pod، إلى أي عنوان يشير nameserver في /etc/resolv.conf افتراضياً عند dnsPolicy: ClusterFirst؟

## Options

- IP الخاص بـ CoreDNS pod مباشرة
- ClusterIP لخدمة kube-dns
- 127.0.0.53 الخاص بـ systemd-resolved
- نسخة غير معدلة من resolv.conf للعقدة

## Solution

**ClusterIP لخدمة kube-dns** هي الإجابة الصحيحة: مع `ClusterFirst` يضع kubelet عنوان ClusterIP لخدمة `kube-dns` كـ nameserver، ويضيف نطاقات search مثل `<ns>.svc.cluster.local` وخيار `ndots:5`. يمكن التحقق من ذلك بتنفيذ `cat /etc/resolv.conf` داخل الـ pod ومقارنة العنوان مع `kubectl -n kube-system get svc kube-dns`؛ فالـ pods لا تتصل بعناوين CoreDNS pods مباشرة بل عبر ClusterIP الثابت للخدمة.
