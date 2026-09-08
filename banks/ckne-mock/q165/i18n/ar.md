## Question

أي أمر يختبر دفعة واحدة pod-to-pod وpod-to-Service وDNS والسياسات والتشفير إن كان مفعلاً في cluster يعمل بـ Cilium؟

## Options

- ping -c 1 8.8.8.8
- kubectl get all
- cilium delete --all
- cilium connectivity test

## Solution

**cilium connectivity test** هي الإجابة الصحيحة: `cilium connectivity test` هو smoke test القياسي بعد التثبيت أو الترقية. يغطي hairpin وNodePort المحلي والبعيد وسياسات L3–L7 وDNS ويحدد السيناريو الفاشل بدقة.
