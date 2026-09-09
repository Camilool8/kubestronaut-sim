## Question

أي آلية توفر مصادقة متبادلة لكل workload وهوية تشفيرية لكل pod مع mTLS تلقائي، عادة عبر service mesh؟

## Options

- Basic Auth على kubelet
- كلمة مرور مشتركة في ConfigMap
- NodeRestriction admission plugin
- mTLS بهويات SPIFFE/SVID تصدر تلقائياً

## Solution

**mTLS بهويات SPIFFE/SVID تصدر تلقائياً** هي الإجابة الصحيحة: تمنح service meshes كل workload هوية SPIFFE داخل شهادات X.509 قصيرة العمر تسمى SVID، وتبني mTLS تلقائياً اعتماداً على ServiceAccount بدلاً من عنوان IP.
