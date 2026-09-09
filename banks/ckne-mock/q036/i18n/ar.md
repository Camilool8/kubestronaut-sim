## Question

كيف تسمح بخروج egress من pod فقط إلى الشبكة 203.0.113.0/24 مع استثناء المضيف 203.0.113.9؟

## Options

- إضافة المضيف إلى /etc/hosts كـ blackhole
- لا يدعم ipBlock الاستثناءات
- سياستان منفصلتان: allow وdeny
- ipBlock مع cidr 203.0.113.0/24 وexcept 203.0.113.9/32

## Solution

**ipBlock مع cidr 203.0.113.0/24 وexcept 203.0.113.9/32** هي الإجابة الصحيحة: يدعم `ipBlock` حقلي `cidr` وقائمة `except`. تذكّر أن أي egress policy تعزل كل ما عدا المسموح، بما في ذلك DNS؛ لذلك اسمح أيضاً بـ UDP وTCP على المنفذ 53 نحو kube-dns.
