## Question

تُسقط حركة pod في مكان غير معروف داخل stack الخاص بـ kernel، ربما iptables أو tc أو route. أي أداة eBPF تتتبع مسار packet وتظهر أين أُسقطت؟

## Options

- kubectl describe pod مطول
- df -h
- top
- pwru أو packet, where are you?

## Solution

**pwru أو packet, where are you?** هي الإجابة الصحيحة: تستخدم `pwru` من Cilium تقنية eBPF لتتبع رحلة packet عبر وظائف kernel مثل netfilter وroutes وtc، وتعرض سبب ومكان drop، حتى عندما يرى tcpdump packet تدخل ولا يراها تخرج.
