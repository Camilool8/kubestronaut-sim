## Question

هل تستطيع NetworkPolicy منشأة في namespace باسم prod اختيار وعزل pods في dev؟

## Options

- فقط مع Calico
- نعم عبر annotation خاصة بالـ cross-namespace
- لا، NetworkPolicy مورد namespaced
- نعم عبر namespaceSelector

## Solution

**لا، NetworkPolicy مورد namespaced** هي الإجابة الصحيحة: يختار `spec.podSelector` الأهداف داخل namespace الخاصة بالـ policy فقط. يظهر namespaceSelector في from أو to لتعريف المصادر والوجهات المسموحة، لا لاختيار pods التي ستُعزل.
