## Question

عند تطبيق golden signals على شبكة الكلاستر، أي مجموعة تمثل latency وtraffic وerrors وsaturation؟

## Options

- replicas والعقد وnamespaces وCRDs
- p99 latency وbytes/s وأخطاء 5xx أو retransmissions وتشبع conntrack
- commits وbuilds وdeploys وrollbacks
- CPU والذاكرة والقرص وuptime للعقد

## Solution

**p99 latency وbytes/s وأخطاء 5xx أو retransmissions وتشبع conntrack** هي الإجابة الصحيحة: تتطابق الإشارات الأربع مع p99 latency، وthroughput بالـ bytes أو packets، ومعدل الأخطاء مثل drops وresets و5xx، والتشبع مثل entries/limit في conntrack أو qdisc drops واستخدام bandwidth.
