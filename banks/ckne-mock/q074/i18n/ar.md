## Question

ما فائدة تعريف targetPort باسم، مثل targetPort: http، بدلاً من رقم؟

## Options

- يجعل الاتصال أسرع
- يشير الاسم إلى containerPort مسمى داخل كل pod
- يمنع التعارض مع NodePort
- أسماء المنافذ إلزامية في Gateway API

## Solution

**يشير الاسم إلى containerPort مسمى داخل كل pod** هي الإجابة الصحيحة: مع `targetPort: http` يعرّف كل pod منفذاً باسم http ويمكن أن يختلف رقمه بين الإصدارات. تحله Service لكل pod، وهو مفيد عند migration أو rolling update يغير منفذ التطبيق.
