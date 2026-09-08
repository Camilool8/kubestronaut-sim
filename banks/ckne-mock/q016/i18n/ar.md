## Question

pod في حالة Running لكنه لا يستقبل حركة من Service. يظهر EndpointSlice أن endpoint بقيمة ready: false. ما السبب الأرجح؟

## Options

- CoreDNS ينهار باستمرار
- يعمل kube-proxy فقط مع ready: true مكتوبة في manifest
- تفشل readinessProbe، فيُزال pod من الموازنة
- انتهت صلاحية ClusterIP

## Solution

**تفشل readinessProbe، فيُزال pod من الموازنة** هي الإجابة الصحيحة: تتحكم `readinessProbe` في توفر endpoint. ما دامت تفشل يبقى pod غير جاهز في EndpointSlice ولا يستقبل حركة. افحص الأحداث عبر `kubectl describe pod`.
