## Question

ضُبط pod على dnsPolicy: Default. ما السلوك ولماذا الاسم خادع؟

## Options

- يستخدم 8.8.8.8 دائماً
- يعطل DNS بالكامل
- يرث resolv.conf الخاص بالعقدة
- يستخدم DNS الكلاستر كما يوحي الاسم

## Solution

**يرث resolv.conf الخاص بالعقدة** هي الإجابة الصحيحة: يعني `Default` وراثة إعداد DNS من العقدة، ما قد يكسر حل أسماء Services. السياسة المطبقة افتراضياً على pods تسمى فعلياً `ClusterFirst`. لجعل الـ pod يستخدم DNS العنقود يجب اختيار `ClusterFirst` (أو `ClusterFirstWithHostNet` مع hostNetwork)؛ أما `Default` فهو مناسب فقط لأعباء العمل التي تحتاج إلى resolver العقدة ولا تستدعي أسماء Services.
