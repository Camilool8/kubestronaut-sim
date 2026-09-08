## Question

ماذا يحدث لاتصالات جديدة نحو ClusterIP لخدمة لا تملك أي endpoint جاهز؟

## Options

- تُعاد إلى apiserver
- تُرفض فوراً عبر REJECT ويظهر connection refused
- تبقى في queue داخل kernel حتى يبدأ pod
- ينشئ kube-proxy استجابة HTTP 404

## Solution

**تُرفض فوراً عبر REJECT ويظهر connection refused** هي الإجابة الصحيحة: يثبت kube-proxy قاعدة reject للخدمة التي لا تملك endpoints، فيحصل العميل على connection refused بسرعة. التفريق بين refused وبين timeout يساعد: الأول غالباً endpoints أو port، والثاني policy أو route أو firewall.
