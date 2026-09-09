## Question

بعد نقل Calico من VXLAN إلى IPIP توقفت حركة pods بين العقد فقط في بيئة cloud. ما السبب الأرجح؟

## Options

- يستخدم IPIP البروتوكول IP رقم 4، وقد تحجبه security groups التي تسمح TCP/UDP/ICMP فقط
- زادت MTU تلقائياً
- لم يعد IPIP موجوداً
- لا يدعم kube-proxy IPIP

## Solution

**يستخدم IPIP البروتوكول IP رقم 4، وقد تحجبه security groups التي تسمح TCP/UDP/ICMP فقط** هي الإجابة الصحيحة: لا يستخدم IPIP منافذ TCP أو UDP؛ إنه IP protocol 4. قد تسقطه security groups بصمت، بينما يمر VXLAN عبر UDP 4789 أو 8472. اسمح protocol 4 أو عد إلى VXLAN.
