## Question

تشتكي التطبيقات من بطء حل أسماء خارجية مثل api.github.com داخل pods، ويظهر tcpdump عدة NXDOMAIN قبل الجواب الصحيح. ما السبب والتخفيف؟

## Options

- CoreDNS تالف ويرد متأخراً
- TTL للسجل صفر
- توسيع ndots:5 عبر search domains؛ استخدم FQDN بنقطة نهائية
- نقص bandwidth بين العقد وCoreDNS

## Solution

**توسيع ndots:5 عبر search domains؛ استخدم FQDN بنقطة نهائية** هي الإجابة الصحيحة: مع `ndots:5` يُوسّع أي اسم بأقل من خمس نقاط عبر search domains قبل الاستعلام المطلق، ما يولد عدة NXDOMAIN. تجبر النقطة النهائية الاستعلام المطلق، ويمكن ضبط `dnsConfig.options ndots:1` لكل pod.
