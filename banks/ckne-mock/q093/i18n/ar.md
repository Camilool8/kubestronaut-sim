## Question

في MCS API، ما الفرق بين ServiceImport من نوع ClusterSetIP ونوع Headless؟

## Options

- ClusterSetIP يوفر VIP واحداً يوازن عبر clusters
- لا فرق
- ClusterSetIP لـ IPv4 فقط وHeadless لـ IPv6 فقط
- Headless أسرع دائماً

## Solution

**ClusterSetIP يوفر VIP واحداً يوازن عبر clusters** هي الإجابة الصحيحة: يشبه السلوك داخل cluster واحدة: يوفر `ClusterSetIP` VIP للاستهلاك المتوازن، بينما يعرض `Headless` كل backend بسجل مستقل عندما يحتاج العميل إلى instance محددة عبر clusters.
