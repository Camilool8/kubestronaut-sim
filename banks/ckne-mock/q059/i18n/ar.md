## Question

أي أمر tcpdump يلتقط فقط حركة DNS الخاصة بـ pod عنوانه 10.0.1.5 على أي واجهة في العقدة؟

## Options

- tcpdump -i lo udp port 53 -c 100
- tcpdump -i any -n port 53 and host 10.0.1.5
- tcpdump -n tcp port 80 and host 10.0.1.5
- tcpdump -i eth0 icmp and host 10.0.1.5

## Solution

**tcpdump -i any -n port 53 and host 10.0.1.5** هي الإجابة الصحيحة: يغطي `-i any` كل الواجهات، ويرشح `port 53` DNS عبر UDP وTCP، ويقصر `host 10.0.1.5` النتائج على pod. أضف `-vvv` لرؤية الأسماء وrcodes.
