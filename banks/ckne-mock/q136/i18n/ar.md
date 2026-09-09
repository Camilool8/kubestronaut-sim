## Question

حذفت Service وأعدت إنشاءها بالاسم نفسه، فتوقفت تطبيقات خزنت IP القديم. أي درس معماري يؤكده ذلك؟

## Options

- يعود IP القديم بعد 24 ساعة
- يجب استخدام IP الخاص بـ pod مباشرة
- لا يمكن إعادة إنشاء Services
- قد يتغير ClusterIP عند إعادة إنشاء Service

## Solution

**قد يتغير ClusterIP عند إعادة إنشاء Service** هي الإجابة الصحيحة: يُخصص IP ديناميكياً من service range عند الإنشاء ما لم يثبت عبر spec.clusterIP. العقد المستقر في Kubernetes هو الاسم. انتبه أيضاً إلى DNS caching داخل التطبيقات، خصوصاً JVM.
