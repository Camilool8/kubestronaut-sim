## Question

في Istio multi-cluster من نوع multi-primary لا تثق workloads في cluster A بشهادات cluster B وتظهر TLS errors. أي متطلب هوية نُسي؟

## Options

- مشاركة root CA أو trust domain نفسها
- استخدام namespace نفسه في الاثنين
- إيقاف mTLS مؤقتاً
- إعطاء كل pod عنواناً عاماً

## Solution

**مشاركة root CA أو trust domain نفسها** هي الإجابة الصحيحة: تحتاج الهوية الاتحادية إلى root مشتركة. إذا أنشأ كل cluster CA مستقلة يصبحان جزيرتي ثقة. أصدر intermediate CAs من root واحدة أو استخدم SPIRE federation قبل ربط meshes.
