## Question

في CNI يعمل بوضع native routing دون encapsulation، ماذا تتوقع أن ترى في `ip route` على العقدة؟

## Options

- مسارات إلى podCIDRs للعقد الأخرى عبر IP العقدة المجاورة
- مسار /32 لكل pod في الكلاستر
- لا توجد مسارات تتعلق بـ pods
- المسار الافتراضي فقط نحو gateway الفيزيائي

## Solution

**مسارات إلى podCIDRs للعقد الأخرى عبر IP العقدة المجاورة** هي الإجابة الصحيحة: في native routing لا تغلف packets؛ يجب أن تعرف كل عقدة أن podCIDR الخاص بالعقدة الأخرى يمكن الوصول إليه عبر IP تلك العقدة. يثبت CNI هذه المسارات أو تتعلم عبر BGP، وغيابها يكسر cross-node traffic.
