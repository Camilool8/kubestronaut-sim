## Question

لقياس availability وlatency من الخارج إلى الداخل ومحاكاة تجربة المستخدم، ما الأسلوب المستخدم؟

## Options

- Synthetic monitoring باستخدام Blackbox Exporter
- logs الخاصة بـ pods فقط
- kubectl get events كل دقيقة عبر cron
- إضافة replicas لـ Prometheus وGrafana

## Solution

**Synthetic monitoring باستخدام Blackbox Exporter** هي الإجابة الصحيحة: لا تكشف metrics الداخلية فشل public DNS أو external LB أو الشهادات المنتهية. تختبر synthetic probes المسار الكامل دورياً، وتصبح `probe_success` و`probe_duration_seconds` مؤشرات SLI خارجية.
