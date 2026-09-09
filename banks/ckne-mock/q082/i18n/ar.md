## Question

endpoints الخاصة بـ Service صحيحة والاتصال المباشر pod-to-pod يعمل، لكن ClusterIP يفشل من كل pods على عقدة واحدة فقط. ما المشتبه الرئيسي؟

## Options

- CoreDNS متوقف في كل replicas
- kube-proxy على تلك العقدة متوقف أو لم يبرمج القواعد
- namespace قيد الحذف
- container image خاطئة

## Solution

**kube-proxy على تلك العقدة متوقف أو لم يبرمج القواعد** هي الإجابة الصحيحة: يُنفذ ClusterIP محلياً على كل عقدة عبر iptables أو IPVS أو eBPF. إذا كانت عقدة واحدة لا تصل إلى VIPs فالمشكلة في البرمجة المحلية: kube-proxy أو مزامنة القواعد أو firewall محلي.
