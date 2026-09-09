## Question

يجب السماح فقط بـ GET /public/* وحجب POST والمسارات الأخرى باستخدام network policy في CNI. ماذا يتطلب ذلك؟

## Options

- NetworkPolicy أصلية بحقل httpRules
- firewall خارجي فقط
- قواعد L7 مثل CiliumNetworkPolicy مع toPorts.rules.http method وpath
- يكفي endPort لمجال منافذ HTTP

## Solution

**قواعد L7 مثل CiliumNetworkPolicy مع toPorts.rules.http method وpath** هي الإجابة الصحيحة: الفلترة حسب HTTP method وpath تعمل على L7. قد يحقن Cilium proxy شفافاً للتدفقات المشمولة، لذلك تضيف سياسة L7 قفزة proxy وlatency فقط حيث تطبق.
