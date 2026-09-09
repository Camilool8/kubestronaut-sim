## Question

لتدقيق أي حركة شبكة مرت فعلياً أو حُجبت بين workloads، ما مصدر البيانات الصحيح؟

## Options

- logs الخاصة بـ kube-scheduler
- Datapath flow logs مثل Hubble وCalico وVPC flow logs
- kubectl get events
- audit log الخاص بـ kube-apiserver بمستوى RequestResponse

## Solution

**Datapath flow logs مثل Hubble وCalico وVPC flow logs** هي الإجابة الصحيحة: يسجل audit log الخاص بـ apiserver عمليات API، وليس packets. لحركة الشبكة استخدم flow logs من CNI أو datapath التي تعرض المصدر والوجهة والمنفذ والقرار والسياسة ويمكن إرسالها إلى SIEM.
