## Question

ما تأثير sessionAffinity: ClientIP على HEADLESS Service؟

## Options

- لا تأثير عملي على flow
- تحول Service إلى NodePort
- تسبب دائماً خطأ validation
- affinity مثالية لكل عميل

## Solution

**لا تأثير عملي على flow** هي الإجابة الصحيحة: تعمل affinity في proxy فوق VIP. تقدم headless Service DNS مباشرة، فيصبح resolver أو العميل هو الموازن. قد يُقبل الإعداد لكن تأثيره الفعلي معدوم. لا يحول ذلك الخدمة إلى NodePort ولا يرفضه apiserver بالضرورة؛ إن احتجت إلى ثبات الجلسة مع headless Service فيجب تنفيذه في العميل أو عبر service mesh.
