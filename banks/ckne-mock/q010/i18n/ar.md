## Question

ما السلوك الشبكي لـ pod مضبوط على hostNetwork: true؟

## Options

- يفقد الاتصال الخارجي
- يحصل على IP من pod CIDR كالمعتاد
- يتواصل فقط مع pods في namespace نفسه
- يشارك network namespace للعقدة ويستخدم IP العقدة

## Solution

**يشارك network namespace للعقدة ويستخدم IP العقدة** هي الإجابة الصحيحة: مع `hostNetwork: true` لا يحصل pod على netns مستقل، بل يستخدم IP وواجهات العقدة. قد تتعارض المنافذ مع عمليات المضيف، وغالباً لا تنطبق NetworkPolicies المبنية على podSelector كما هو متوقع.
