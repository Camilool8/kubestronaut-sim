## Question

ما المكونات الرئيسية في Submariner لربط clusters؟

## Options

- Broker وGateway nodes وLighthouse
- Hub وSpoke وWheel
- Master وWorker وEtcd
- Ingress وEgress وMidgress

## Solution

**Broker وGateway nodes وLighthouse** هي الإجابة الصحيحة: يزامن Broker معلومات endpoints، وتنشئ Gateway nodes tunnels مشفرة بين clusters، بينما يحل Lighthouse أسماء `clusterset.local` وينفذ MCS API. يدعم Globalnet المجالات المتداخلة.
