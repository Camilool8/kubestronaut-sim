## Question

تحتاج baseline للـ bandwidth والـ latency بين podين على عقدتين محددتين قبل لوم الشبكة على بطء التطبيق. ما الطريقة المباشرة؟

## Options

- kubectl top nodes وقت الذروة
- إضافة replicas ومراقبة الرسوم
- iperf3 بين podين على العقدتين مع المقارنة بحالة same-node
- قراءة وثائق سعة datacenter

## Solution

**iperf3 بين podين على العقدتين مع المقارنة بحالة same-node** هي الإجابة الصحيحة: تقيس زوجة iperf3 الحد الفعلي للـ datapath، بما في ذلك overhead الخاص بالـ encapsulation والتشفير. تساعد مقارنة same-node وcross-node على تحديد موضع التدهور.
