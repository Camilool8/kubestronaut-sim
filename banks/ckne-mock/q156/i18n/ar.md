## Question

pod يستخدم hostNetwork: true يستطيع الوصول إلى pods تحميها NetworkPolicy تسمح فقط بـ podSelectors محددة، والوصول يعمل. لماذا؟

## Options

- يفعل hostNetwork وضع شبكة إداري
- خلل معروف في TCP keepalive
- السياسة لـ TCP والحركة UDP
- تخرج الحركة من IP العقدة لا من IP pod ذي هوية workload

## Solution

**تخرج الحركة من IP العقدة لا من IP pod ذي هوية workload** هي الإجابة الصحيحة: يظهر hostNetwork pod للشبكة كأنه العقدة نفسها. تعامل CNIs عناوين العقد بشكل خاص لتعمل مثلاً kubelet probes، لذلك قد لا تقيده سياسات هوية pods كما هو متوقع.
