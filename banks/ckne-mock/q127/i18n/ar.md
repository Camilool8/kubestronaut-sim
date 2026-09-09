## Question

ما الفرق الحقيقي بين hostPort على pod وService من نوع NodePort؟

## Options

- لا فرق
- NodePort يعمل في السحابة فقط
- hostPort أكثر أماناً ويوازن أفضل
- يفتح hostPort المنفذ فقط على العقدة التي يعمل عليها pod

## Solution

**يفتح hostPort المنفذ فقط على العقدة التي يعمل عليها pod** هي الإجابة الصحيحة: يربط `hostPort` pod بعقدة بعينها وتحد تعارضات المنافذ من scheduling. أما NodePort فيبرمجه kube-proxy على كل عقدة. الخلط بينهما يسبب حالة يعمل على عقدة ويفشل على البقية.
