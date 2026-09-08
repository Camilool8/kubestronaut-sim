## Question

تفشل الاتصالات بشكل متقطع تحت الحمل ويعرض dmesg على العقدة: nf_conntrack: table full, dropping packet. أي metric تؤكد المشكلة وما الحل؟

## Options

- إعادة تشغيل CNI تحلها نهائياً
- مقارنة node_nf_conntrack_entries مع node_nf_conntrack_entries_limit
- مراقبة apiserver_request_total وتوسيع apiserver
- فحص coredns_cache_hits_total ومسح cache

## Solution

**مقارنة node_nf_conntrack_entries مع node_nf_conntrack_entries_limit** هي الإجابة الصحيحة: يشغل كل اتصال يمر عبر NAT مدخلاً في conntrack. امتلاء الجدول يؤدي إلى drops صامتة وفشل متقطع. راقب نسبة entries إلى limit عبر node_exporter واضبط `nf_conntrack_max`.
