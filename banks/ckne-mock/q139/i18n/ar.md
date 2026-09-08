## Question

يعمل `kubectl port-forward svc/my-api 8080:80` أثناء debug، لكن pods في production لا تصل إلى Service نفسها. لماذا لا يتحقق port-forward من المسار الحقيقي؟

## Options

- لأنه tunnel مباشر عبر apiserver إلى pod واحدة ويتجاوز datapath الخاص بـ Service
- لأن production تستخدم cluster أخرى دائماً
- لأنه يستخدم UDP
- لأنه أبطأ فقط

## Solution

**لأنه tunnel مباشر عبر apiserver إلى pod واحدة ويتجاوز datapath الخاص بـ Service** هي الإجابة الصحيحة: يتجاوز port-forward DNS وNetworkPolicy وkube-proxy ومسار Service. قد يعمل رغم تعطل أي منها. لاختبار المسار الحقيقي نفذ الطلب من داخل pod أخرى.
