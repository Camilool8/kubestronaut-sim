## Question

عند استخدام VXLAN على واجهات عقد MTU الخاصة بها 1500، أي إعداد يمنع fragmentation أو فقد packets الكبيرة؟

## Options

- MTU في CNI بعد خصم overhead النفق، مثل 1450
- تقليل عدد replicas
- رفع MTU في pods إلى 9000 دون تغيير الشبكة
- تعطيل TCP واستخدام UDP فقط

## Solution

**MTU في CNI بعد خصم overhead النفق، مثل 1450** هي الإجابة الصحيحة: يضيف VXLAN نحو 50 بايت. إذا أرسل pod frame بحجم 1500 يتجاوز packet المغلف MTU الفيزيائية وقد يُسقط. اضبط MTU في CNI إلى 1450 أو فعّل jumbo frames على المسار الفيزيائي كله.
