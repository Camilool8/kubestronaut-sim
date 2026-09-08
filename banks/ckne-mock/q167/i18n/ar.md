## Question

تحتوي Grafana الشبكية لكل pod على ملايين series ويستهلك Prometheus عشرات GB. ما أكبر سبب عادة؟

## Options

- dark theme في Grafana
- ألوان كثيرة في charts
- فتح dashboards كثيرة
- انفجار cardinality بسبب labels لكل pod أو veth أو IP مؤقت

## Solution

**انفجار cardinality بسبب labels لكل pod أو veth أو IP مؤقت** هي الإجابة الصحيحة: تتراكم series لكل كيان مؤقت مثل pod hash وveth وIP. القاعدة الذهبية للـ observability الشبكية هي استخدام labels مستقرة مثل namespace وworkload لا الكيانات المؤقتة.
