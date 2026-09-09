## Question

أي manifest يعزل كل pods في namespace عزلاً كاملاً، فلا ingress ولا egress؟

## Options

- حذف كل Services
- policyTypes: [Ingress] فقط
- podSelector: {} مع policyTypes: [Ingress, Egress] ودون قواعد ingress أو egress
- podSelector: {} مع ingress: [{}] وegress: [{}]

## Solution

**podSelector: {} مع policyTypes: [Ingress, Egress] ودون قواعد ingress أو egress** هي الإجابة الصحيحة: اختيار كل pods وإعلان نوعي Ingress وEgress دون قواعد ينفذ total default deny. أما القاعدة الفارغة داخل `[{}]` فتطابق أي مصدر أو وجهة وتسمح بكل شيء، وهي فخ شائع.
