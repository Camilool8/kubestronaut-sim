## Question

ماذا يعيد DNS عند الاستعلام عن headless Service له clusterIP: None وselector؟

## Options

- سجل CNAME إلى kube-apiserver
- ClusterIP الخاص بالخدمة
- NXDOMAIN دائماً
- سجلات A/AAAA بعناوين IP لكل pod جاهز يطابق selector

## Solution

**سجلات A/AAAA بعناوين IP لكل pod جاهز يطابق selector** هي الإجابة الصحيحة: لا يملك headless Service عنوان VIP؛ يجيب CoreDNS بعناوين pods. في StatefulSet يحصل كل pod أيضاً على سجل ثابت مثل `pod.service.ns.svc.cluster.local`، وهو مهم لقواعد البيانات والاكتشاف القائم على الهوية.
