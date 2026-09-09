## Question

أي تركيبة تمنح pod واجهة ثانوية عالية الأداء مع وصول شبه مباشر إلى NIC الفيزيائية لـ NFV أو latency منخفضة؟

## Options

- نسختان من kube-proxy
- رفع CPU requests
- دمج hostPort وNodePort على المنفذ نفسه
- Multus + SR-IOV CNI + device plugin لتسليم VFs إلى pod

## Solution

**Multus + SR-IOV CNI + device plugin لتسليم VFs إلى pod** هي الإجابة الصحيحة: يقسم SR-IOV الـ NIC إلى Virtual Functions تُسلّم مباشرة إلى pod متجاوزة جزءاً كبيراً من stack المضيف. يدير device plugin التخصيص ويربط Multus الواجهة، وهو نمط شائع في telco وNFV.
