## Question

ما القيد الرئيسي لوضع L2 أو ARP في إعلان LoadBalancer عبر MetalLB أو Cilium L2 Announcements؟

## Options

- يتطلب ترخيصاً تجارياً
- تدخل كل حركة VIP عبر عقدة واحدة منتخبة
- يدعم UDP فقط
- لا يعمل مع IPv4

## Solution

**تدخل كل حركة VIP عبر عقدة واحدة منتخبة** هي الإجابة الصحيحة: في L2 تجيب عقدة واحدة عن ARP للـ VIP، فتحد bandwidth الواردة بقدرة تلك العقدة ويعتمد failover على gratuitous ARP. يحل BGP مع ECMP مشكلة التوزيع وسرعة التقارب.
