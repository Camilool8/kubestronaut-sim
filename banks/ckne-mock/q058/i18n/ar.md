## Question

أي أمر يعرض إدخالات connection tracking الخاصة بـ NAT والحالة للتحقيق في ترجمة اتصال pod؟

## Options

- free -m
- lsof -i
- systemctl status conntrack
- conntrack -L | grep `<pod-IP>`

## Solution

**conntrack -L | grep `<pod-IP>`** هي الإجابة الصحيحة: يعرض `conntrack -L` جدول تتبع الاتصالات في kernel، بما في ذلك tuple الأصلي pod→ClusterIP والـ tuple المترجم pod→endpoint بعد DNAT الخاص بـ kube-proxy.
