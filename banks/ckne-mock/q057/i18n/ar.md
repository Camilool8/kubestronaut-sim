## Question

تظل pods في ContainerCreating مع الخطأ failed to allocate for range 0: no IP addresses available in range. ما التشخيص والحل؟

## Options

- تعطل DNS في الكلاستر
- نفاد pool الخاص بـ IPAM على العقدة
- نفاد ذاكرة kubelet
- apiserver يحد معدل الطلبات

## Solution

**نفاد pool الخاص بـ IPAM على العقدة** هي الإجابة الصحيحة: لكل عقدة مجال IP محدود. قد تترك الأعطال leases يتيمة في حالة IPAM مثل `/var/lib/cni/networks/<net>`. احذف سجلات IP التي لا يقابلها container أو وسّع المجال.
