## Question

يعمل `dig app.default.svc.cluster.local` داخل pod لكن يفشل `dig app`. ما أول شيء يجب فحصه؟

## Options

- إصدار kernel على العقدة
- قيم search وndots في /etc/resolv.conf داخل pod
- هل hostNetwork مفعّل
- هل kube-proxy يعمل بـ IPVS أم iptables

## Solution

**قيم search وndots في /etc/resolv.conf داخل pod** هي الإجابة الصحيحة: تعتمد الأسماء المختصرة على search domains وخيار `ndots:5`. إذا تغيّر dnsPolicy أو dnsConfig، أو كان pod في namespace آخر، فلن يتم توسيع الاسم المختصر إلى FQDN الصحيح.
