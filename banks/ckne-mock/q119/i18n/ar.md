## Question

أي مجموعات metrics يستطيع Hubble تصديرها إلى Prometheus عند تفعيل hubble.metrics؟

## Options

- استخدام CPU فقط
- dns وdrop وtcp وflow وicmp وhttp
- metrics فواتير السحابة
- logs نصية فقط

## Solution

**dns وdrop وtcp وflow وicmp وhttp** هي الإجابة الصحيحة: عند تفعيل مجموعات `dns,drop,tcp,flow,icmp,http` يصدر Hubble series حسب namespace وworkload عن DNS والأخطاء وأسباب drops وTCP flags وHTTP status والـ latency، وهي أساس dashboards الشبكية في Cilium.
