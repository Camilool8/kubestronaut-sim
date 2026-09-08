## Question

ما الميزة الأساسية لوضع IPVS في kube-proxy مقارنة بوضع iptables؟

## Options

- موازنة L7 أصلية مع فحص HTTP headers
- تعقيد توجيه يقارب O(1) وخوارزميات موازنة متعددة
- لا يحتاج conntrack
- يشفّر حركة pod-to-pod

## Solution

**تعقيد توجيه يقارب O(1) وخوارزميات موازنة متعددة** هي الإجابة الصحيحة: في iptables تزداد القواعد مع عدد Services وتُفحص تسلسلياً. يستخدم IPVS جداول hash داخل kernel ببحث يقارب O(1) ويوفر round-robin وleast-connections وsource-hash. كلاهما يبقى L4.
