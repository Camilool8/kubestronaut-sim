## Question

في Gateway API Inference Extension، ما دور مورد InferenceModel أو InferenceObjective؟

## Options

- تدريب النموذج داخل الكلاستر
- ربط اسم النموذج المنطقي بـ InferencePool مع تحديد الأهمية
- تحديد عدد GPUs المعروضة من كل عقدة
- استبدال Deployment الخاص بخادم النموذج

## Solution

**ربط اسم النموذج المنطقي بـ InferencePool مع تحديد الأهمية** هي الإجابة الصحيحة: يربط `InferenceModel` الاسم الذي يطلبه العميل بـ `InferencePool` الذي يخدمه، ويحدد criticality للأولوية أو load shedding، ويساعد في canary بين إصدارات أو adapters مختلفة.
