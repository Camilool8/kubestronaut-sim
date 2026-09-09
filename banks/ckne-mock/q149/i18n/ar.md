## Question

في Inference Extension، كيف يرسل HTTPRoute الحركة إلى InferencePool بدلاً من Service؟

## Options

- تشير backendRefs إلى InferencePool عبر group وkind
- عبر annotation باسم inference=true
- باستبدال Gateway بـ DaemonSet
- هذا مستحيل لأن backendRefs تقبل Service فقط

## Solution

**تشير backendRefs إلى InferencePool عبر group وkind** هي الإجابة الصحيحة: حقل `backendRefs` قابل للتوسعة عبر group وkind. عند الإشارة إلى InferencePool ينتقل الاختيار النهائي للـ endpoint إلى EPP الذي يراعي queue وKV-cache وLoRA metrics.
