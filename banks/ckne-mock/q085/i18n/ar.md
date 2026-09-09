## Question

يحتاج HTTPRoute إلى backendRefs تشير إلى Service في namespace أخرى. ما المطلوب؟

## Options

- إعادة إنشاء Service كـ NodePort
- ReferenceGrant في namespace الخاصة بـ Service يصرح للـ route
- لا شيء، المراجع عبر namespaces مسموحة افتراضياً
- نقل Gateway إلى kube-system

## Solution

**ReferenceGrant في namespace الخاصة بـ Service يصرح للـ route** هي الإجابة الصحيحة: المراجع عبر namespaces مرفوضة افتراضياً للحماية من اختطاف الحركة. ينشر مالك namespace الوجهة `ReferenceGrant` يحدد from وto، وبعدها فقط تُحل backend reference.
