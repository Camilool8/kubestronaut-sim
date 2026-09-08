## Question

في cluster بلا أي NetworkPolicy، ما الوضع الشبكي الافتراضي بين pods؟

## Options

- يسمح فقط داخل namespace نفسه
- يسمح TCP فقط
- كل شيء محجوب افتراضياً
- كل شيء مسموح بين أي pods

## Solution

**كل شيء مسموح بين أي pods** هي الإجابة الصحيحة: نموذج شبكة Kubernetes مفتوح افتراضياً: لا توجد عزلة دون policies. لذلك من أفضل الممارسات بدء كل namespace بسياسة default-deny ثم السماح الصريح بما يلزم.
