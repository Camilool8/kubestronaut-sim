## Question

أي API توحّد اكتشاف الخدمات بين عدة clusters، وما نطاق DNS الذي تستخدمه؟

## Options

- ExternalDNS مع external.local
- ClusterFederation v1 مع federated.local
- ServiceExport/ServiceImport
- NodePort مشترك مع nodes.local

## Solution

**ServiceExport/ServiceImport** هي الإجابة الصحيحة: في MCS API يؤدي تصدير Service عبر `ServiceExport` إلى إنشاء `ServiceImport` في clusters الأخرى، ويمكن حلها باسم `svc.ns.svc.clusterset.local`. من التطبيقات Cilium Cluster Mesh وSubmariner وGKE MCS.
