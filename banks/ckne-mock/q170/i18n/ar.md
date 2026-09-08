## Question

يعرض hubble observe تدفقات DROPPED بسبب Policy denied في اتجاه pod→kube-dns بعد تطبيق egress policy على namespace، وتتوقف التطبيقات عن حل الأسماء. ما القراءة الصحيحة؟

## Options

- غيّرت kube-dns المنافذ
- يؤكد flow log السبب الجذري
- انهار CoreDNS
- Hubble غير صحيح لهذا النوع من flow

## Solution

**يؤكد flow log السبب الجذري** هي الإجابة الصحيحة: تدفقات DROPPED إلى kube-dns:53 مباشرة بعد تطبيق egress policy هي علامة واضحة على نسيان قاعدة السماح بـ DNS. يحول Hubble العرض الغامض إلى علاقة سبب ونتيجة مرئية.
