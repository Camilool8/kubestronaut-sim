## Question

ما أسرع اختبار يتحقق معاً من DNS والاتصال الأساسي في كلاستر جديد؟

## Options

- ping 8.8.8.8 من جهازك
- kubectl get nodes -o wide مع فحص INTERNAL-IP والإصدار
- kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default
- kubectl top pods --containers على kube-system

## Solution

**kubectl run test --rm -it --image=busybox:1.36 -- nslookup kubernetes.default** هي الإجابة الصحيحة: ينشئ الأمر pod مؤقتاً ويحل `kubernetes.default`، فيختبر resolv.conf وsearch domains وCoreDNS وخدمة kube-dns ثم يحذف pod. الفشل يوجه مباشرة إلى DNS أو CNI.
