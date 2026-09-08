## Question

عناوين pods قابلة للتوجيه في datacenter، لكن الحركة إلى 10.0.0.0/8 تخرج بعد SNAT بعنوان العقدة. كيف تحافظ على IP الأصلي للـ pod؟

## Options

- استخدام hostNetwork لكل pods
- إعداد ip-masq-agent
- إيقاف kube-proxy
- هذا مستحيل دون service mesh

## Solution

**إعداد ip-masq-agent** هي الإجابة الصحيحة: يتحكم `ip-masq-agent` في masquerade حسب الوجهة. تخرج CIDRs المدرجة في nonMasqueradeCIDRs بعنوان pod الأصلي. توجد بدائل مماثلة في Cilium وCalico. في Cilium يُستخدم ipMasqAgent مع قائمة nonMasqueradeCIDRs، وفي Calico يُضبط natOutgoing على مستوى IPPool؛ في الحالتين ترى وجهات الشبكة الداخلية عنوان الـ pod الأصلي بينما تستمر حركة الإنترنت في الخروج بعنوان العقدة.
