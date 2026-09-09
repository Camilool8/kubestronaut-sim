## Question

للسماح بحركة من frontend pod عنوانه 10.244.3.7 أنشأت ipBlock بقيمة 10.244.3.7/32. عمل اليوم وتعطل غداً. لماذا؟

## Options

- تنتهي صلاحية ipBlock خلال 24 ساعة
- CIDR /32 غير صالح في NetworkPolicy
- يحتاج frontend إلى hostNetwork
- عناوين pods مؤقتة وقد تصل الحركة بعد SNAT؛ استخدم selectors

## Solution

**عناوين pods مؤقتة وقد تصل الحركة بعد SNAT؛ استخدم selectors** هي الإجابة الصحيحة: يجب أن تستخدم السياسات بين workloads الهوية والـ labels لا العناوين. تتغير عناوين pods وقد يحدث NAT في المسار، بينما يناسب ipBlock غالباً العناوين الخارجية عن الكلاستر.
