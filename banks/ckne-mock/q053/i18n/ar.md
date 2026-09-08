## Question

تبلغ التطبيقات عن latency عالية بين خدمتين، وتزداد node_netstat_Tcp_RetransSegs بسرعة على العقد المعنية. ماذا يعني ذلك؟

## Options

- فقد packets في المسار بسبب MTU أو الطوابير أو رابط سيئ، ما يفرض TCP retransmissions
- DNS بطيء
- يحتاج etcd إلى compaction
- Deployment يفتقد replicas

## Solution

**فقد packets في المسار بسبب MTU أو الطوابير أو رابط سيئ، ما يفرض TCP retransmissions** هي الإجابة الصحيحة: زيادة TCP retransmissions تعني فقداً في packets. سبب شائع هو MTU غير صحيحة مع overlay مثل VXLAN. تحقق عبر `ping -M do -s 1472` و`tcpdump` وإعداد MTU في CNI.
