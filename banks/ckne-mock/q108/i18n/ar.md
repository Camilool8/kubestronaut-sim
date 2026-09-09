## Question

كيف تتحقق من أن تشفير WireGuard في Cilium مفعّل فعلاً ويشفّر الحركة بين العقد؟

## Options

- cilium status | grep Encryption
- kubectl get secrets
- ping بين pods
- مراقبة ألوان pods في dashboard

## Solution

**cilium status | grep Encryption** هي الإجابة الصحيحة: تحقق على ثلاث طبقات: يعرض agent وضع التشفير، ويؤكد `wg show` وجود peers وhandshakes حديثة، ويجب أن يظهر capture على NIC الفيزيائية packets WireGuard على UDP 51871 بدلاً من payload واضح بين عناوين pods.
