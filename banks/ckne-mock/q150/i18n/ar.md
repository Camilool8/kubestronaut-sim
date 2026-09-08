## Question

بعد جمع كل egress على egressIP واحد تبدأ الاتصالات الخارجية بالفشل وقت الذروة مع cannot assign requested address على gateway. أي حد تم بلوغه؟

## Options

- حد DNS
- حد bandwidth في kernel للعقدة
- حد pods لكل عقدة
- نفاد منافذ المصدر الخاصة بـ SNAT

## Solution

**نفاد منافذ المصدر الخاصة بـ SNAT** هي الإجابة الصحيحة: يجمع SNAT الاتصالات في egressIP ومنافذ المصدر، ويجب أن يبقى tuple فريداً. عند الضغط تنفد مجموعة المنافذ المتاحة، وهو port exhaustion المعتاد في نقطة NAT مركزية.
