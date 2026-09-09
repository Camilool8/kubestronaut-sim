## Question

ترسل ping إلى ClusterIP الخاصة بـ Service ولا تحصل على رد، لكن curl على منفذ Service يعمل. لماذا؟

## Options

- يتطلب ICMP خدمة NodePort
- Service معطلة وcurl يستخدم cache
- الـ VIP عبارة عن قواعد DNAT ولا توجد واجهة ترد على ICMP
- firewall يحجب curl

## Solution

**الـ VIP عبارة عن قواعد DNAT ولا توجد واجهة ترد على ICMP** هي الإجابة الصحيحة: لا يُسند VIP إلى واجهة حقيقية؛ تترجم iptables أو IPVS أو eBPF فقط `VIP:port`. اختبر Services عبر `nc -zv` أو `curl` لا عبر ping.
