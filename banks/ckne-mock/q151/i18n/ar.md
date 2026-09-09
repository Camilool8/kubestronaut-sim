## Question

يجب ربط clusterين لهما pod CIDR متطابق، 10.244.0.0/16، عبر Submariner. هل هذا ممكن؟

## Options

- فقط إذا كان أحدهما IPv6
- لا، المجالات المتداخلة تمنع أي اتصال
- نعم باستخدام Globalnet مع CIDRs افتراضية وNAT بين clusters
- نعم دون أي إعداد

## Solution

**نعم باستخدام Globalnet مع CIDRs افتراضية وNAT بين clusters** هي الإجابة الصحيحة: يمنع تداخل CIDRs التوجيه المباشر. ينشئ Submariner Globalnet مجالات globalCIDR افتراضية وينفذ ingress وegress NAT، وهو حل البيئات القائمة ذات المجالات المتكررة.
