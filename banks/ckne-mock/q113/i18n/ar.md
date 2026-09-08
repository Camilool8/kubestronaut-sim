## Question

ما الحقول الأساسية في مورد Certificate الخاص بـ cert-manager؟

## Options

- key وcert وca كنص صريح
- host وpath وbackend
- secretName وdnsNames وissuerRef
- image وreplicas وports

## Solution

**secretName وdnsNames وissuerRef** هي الإجابة الصحيحة: يصف Certificate الحالة المطلوبة. يصدر cert-manager الشهادة عبر `issuerRef` ويكتب المفتاح والشهادة إلى Secret المحددة في `secretName` ويجددها تلقائياً، ثم يشير Gateway أو Ingress إلى Secret.
