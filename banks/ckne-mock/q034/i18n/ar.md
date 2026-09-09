## Question

أي NetworkPolicy تنفذ default deny لحركة ingress لكل pods في namespace؟

## Options

- podSelector: {} مع policyTypes: [Ingress] ومن دون قواعد ingress
- استبعاد namespace من CNI
- podSelector: deny-all مع policyTypes: [Ingress]
- policy تحتوي ingress: [{}] لكل pods

## Solution

**podSelector: {} مع policyTypes: [Ingress] ومن دون قواعد ingress** هي الإجابة الصحيحة: يختار `podSelector: {}` كل pods، وإعلان `policyTypes: [Ingress]` دون قواعد يمنع كل الدخول. انتبه: `ingress: [{}]` يفعل العكس ويسمح بكل شيء.
