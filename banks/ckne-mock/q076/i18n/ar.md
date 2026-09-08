## Question

إضافة إلى سجلات A، أي نوع سجل DNS ينشئه Kubernetes للمنافذ المسماة في Service، وبأي صيغة؟

## Options

- TXT يحتوي YAML الخاص بـ Service
- SRV بالصيغة _port._proto.service.ns.svc.cluster.local
- MX لكل منفذ مسمى
- NS لكل namespace

## Solution

**SRV بالصيغة _port._proto.service.ns.svc.cluster.local** هي الإجابة الصحيحة: ينشئ Kubernetes سجل SRV مثل `_http._tcp.my-svc.default.svc.cluster.local` ويعيد اسم المضيف والمنفذ، ما يسمح للتطبيق باكتشاف المنفذ دون hardcode.
