## Question

في Service، ما الفرق بين port وtargetPort وnodePort؟

## Options

- هي أسماء للشيء نفسه
- port هو منفذ Service نفسها
- nodePort فقط إلزامي
- port للـ container وtargetPort للعقدة وnodePort للخدمة

## Solution

**port هو منفذ Service نفسها** هي الإجابة الصحيحة: يتصل العميل بـ `ClusterIP:port`، ثم ينفذ kube-proxy DNAT إلى `podIP:targetPort`. إذا كانت الخدمة مكشوفة على العقد يكون `nodePort` هو المنفذ الخارجي على كل عقدة.
