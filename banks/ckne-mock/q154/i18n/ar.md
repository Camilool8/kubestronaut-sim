## Question

تحتوي NetworkPolicy على policyTypes: [Ingress] لكن الكاتب أضاف أيضاً block باسم egress. ما تأثير block egress؟

## Options

- يُطبق بشكل عادي
- يحجب كل egress
- يسبب validation error
- يُتجاهل لأن policyTypes هي التي تحدد التنفيذ

## Solution

**يُتجاهل لأن policyTypes هي التي تحدد التنفيذ** هي الإجابة الصحيحة: يتبع enforcement قيمة `policyTypes` لا مجرد وجود الأقسام. قد تمر قواعد egress شكلية في code review لكنها لا تعمل فعلياً، وهو فخ شائع في التدقيق والاختبارات.
