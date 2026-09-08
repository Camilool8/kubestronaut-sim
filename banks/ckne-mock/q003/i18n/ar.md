## Question

تحتاج إلى التقاط حركة pod محدد مباشرة من العقدة دون الدخول إليه. ما الأسلوب الصحيح؟

## Options

- تشغيل tcpdump -i eth0 لأن كل حركة pods تمر من eth0 دون تغيير
- هذا غير ممكن؛ tcpdump يعمل فقط داخل pod
- تحديد واجهة veth الخاصة بالـ pod على المضيف وتشغيل tcpdump -i vethXXXX
- تشغيل tcpdump -i lo لأن pods تستخدم loopback المضيف

## Solution

**تحديد واجهة veth الخاصة بالـ pod على المضيف وتشغيل tcpdump -i vethXXXX** هي الإجابة الصحيحة: لكل pod زوج veth: طرف داخل netns باسم eth0 وطرف على المضيف باسم مثل vethXXXX. حدّد الزوج بمقارنة فهارس الواجهات ثم التقط عبر `tcpdump -i vethXXXX`. بديل آخر هو `nsenter -t <PID> -n tcpdump`.
