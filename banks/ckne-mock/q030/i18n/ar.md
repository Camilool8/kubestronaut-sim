## Question

لإتاحة شبكات pods مباشرة للشبكة الفيزيائية للشركة دون NAT وجعل عناوين pod قابلة للتوجيه، ما الأسلوب؟

## Options

- إنشاء NodePort لكل pod
- إعلان pod CIDRs عبر BGP
- تفعيل hostNetwork لكل pods
- زيادة ndots في resolv.conf

## Solution

**إعلان pod CIDRs عبر BGP** هي الإجابة الصحيحة: تنشئ حلول CNI الداعمة لـ BGP جلسات مع routers وتعلن podCIDR لكل عقدة. تتعلم الشبكة الخارجية المسارات وتصل إلى pods مباشرة، دون encapsulation أو NAT. تدعم ذلك حلول مثل Calico وCilium عبر إعداد BGP peering مع أجهزة التوجيه في مركز البيانات، فتصبح عناوين الـ pods قابلة للتوجيه من خارج العنقود دون الحاجة إلى NodePort أو hostNetwork.
