## Question

يحدد listener في Gateway اسم *.example.com، بينما يعلن HTTPRoute الأسماء app.example.com وapp.other.com. ماذا يحدث؟

## Options

- يعمل الاسمان
- تُخدم فقط نقطة التقاطع المتوافقة
- يتبنى Gateway الاسم app.other.com تلقائياً
- يُرفض route بالكامل

## Solution

**تُخدم فقط نقطة التقاطع المتوافقة** هي الإجابة الصحيحة: يرتبط listener بالـ route بناءً على تقاطع hostnames، لذلك يبرمج فقط الاسم المتوافق. افحص حالات Accepted وResolvedRefs عبر `kubectl describe httproute`.
