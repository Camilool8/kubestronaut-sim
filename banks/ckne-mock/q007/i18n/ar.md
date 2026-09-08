## Question

تتواصل pods على العقدة نفسها، لكن pods على عقد مختلفة لا تتواصل. يستخدم CNI تقنية VXLAN. ما السبب الأرجح؟

## Options

- kube-scheduler مضبوط خطأ
- منفذ UDP الخاص بـ VXLAN محجوب بين العقد
- تحتاج pods إلى hostPort للتواصل بين العقد
- CoreDNS متوقف

## Solution

**منفذ UDP الخاص بـ VXLAN محجوب بين العقد** هي الإجابة الصحيحة: تعتمد الحركة بين العقد على encapsulation. إذا حجب firewall منفذ VXLAN UDP، مثل 8472 في Flannel/Cilium أو 4789 القياسي، يفشل التواصل cross-node. افحص عبر `tcpdump -i any udp port 8472` وقواعد firewall أو security group.
