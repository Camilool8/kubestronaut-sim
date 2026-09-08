## Question

في Cilium Cluster Mesh، ما متطلب الشبكة الأساسي بين clusters المتصلة؟

## Options

- etcd واحد مشترك
- PodCIDRs وClusterIDs فريدة وغير متداخلة مع اتصال مباشر بين عقد clusters
- وجود clusters في availability zone واحدة
- الإصدار نفسه تماماً من kernel على كل العقد

## Solution

**PodCIDRs وClusterIDs فريدة وغير متداخلة مع اتصال مباشر بين عقد clusters** هي الإجابة الصحيحة: يحتاج Cluster Mesh إلى pod CIDRs غير متداخلة، وقيم `cluster.id` و`cluster.name` فريدة، ووصول متبادل بين العقد. عندها تتوفر service discovery والموازنة والسياسات بين clusters.
