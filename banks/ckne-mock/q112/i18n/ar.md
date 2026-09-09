## Question

Gateway في namespace باسم infra وTLS Secret في apps. يشير listener إلى Secret لكن status يعرض RefNotPermitted. ما المفقود؟

## Options

- نقل Gateway إلى kube-system
- annotation تجعل Secret عامة
- ReferenceGrant في apps يسمح لـ Gateways من infra
- نسخ Secret يدوياً إلى infra

## Solution

**ReferenceGrant في apps يسمح لـ Gateways من infra** هي الإجابة الصحيحة: تحتاج المراجع إلى Secrets عبر namespaces موافقة صريحة من مالك Secret. أنشئ `ReferenceGrant` في apps يصرح من Gateway في infra إلى Secret، وإلا ترفض Gateway API المرجع لمنع تسريب الشهادات.
