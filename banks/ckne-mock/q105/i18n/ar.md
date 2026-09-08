## Question

يجب السماح بـ egress فقط إلى api.github.com، لكن عناوينه تتغير باستمرار. ما الحل الأصلي في Cilium؟

## Options

- hostAliases داخل pod
- NetworkPolicy أصلية بحقل dns
- CiliumNetworkPolicy باستخدام toFQDNs
- ipBlock لكل مجالات GitHub مع تحديث يدوي

## Solution

**CiliumNetworkPolicy باستخدام toFQDNs** هي الإجابة الصحيحة: تدعم NetworkPolicy الأصلية عناوين IP وselectors فقط. يعترض Cilium DNS ويتعلم العناوين المحلولة للـ FQDN المسموح ويحدث السماح ديناميكياً. يجب أيضاً السماح بخروج DNS على المنفذ 53.
