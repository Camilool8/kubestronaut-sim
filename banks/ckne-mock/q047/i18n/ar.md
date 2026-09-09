## Question

أي أداة في منظومة Cilium توفر رؤية لتدفقات الشبكة L3–L7، بما في ذلك أحكام policy مثل FORWARDED وDROPPED؟

## Options

- etcdctl watch /network
- CriticTool
- kubectl top pods --network
- Hubble عبر observe وUI وmetrics

## Solution

**Hubble عبر observe وUI وmetrics** هي الإجابة الصحيحة: يقرأ `Hubble` أحداث eBPF من datapath. تعرض `hubble observe --verdict DROPPED` التدفق المحجوب والسبب والسياسة، كما يصدر metrics للتدفقات وDNS وHTTP إلى Prometheus.
