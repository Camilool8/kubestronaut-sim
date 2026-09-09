## Question

ما الفرق بين قاعدتي ingress التاليتين؟

```
(A) - from: [{namespaceSelector: X}, {podSelector: Y}]
(B) - from: [{namespaceSelector: X, podSelector: Y}]
```

## Options

- (B) غير صحيحة نحوياً ويرفضها apiserver
- لا فرق بينهما
- (A) تمثل OR بين المصدرين، و(B) تمثل AND: pods ذات Y داخل namespaces ذات X
- (A) تخص egress فقط و(B) تخص ingress فقط

## Solution

**(A) تمثل OR بين المصدرين، و(B) تمثل AND: pods ذات Y داخل namespaces ذات X** هي الإجابة الصحيحة: العناصر المنفصلة في قائمة `from` بدائل بمنطق OR، أما الحقول داخل العنصر نفسه فهي شروط مجتمعة بمنطق AND. شرطة YAML إضافية واحدة تغيّر نطاق الوصول بالكامل.
