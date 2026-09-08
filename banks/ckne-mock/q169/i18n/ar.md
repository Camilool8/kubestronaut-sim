## Question

SLO توفر Gateway هو 99.9% شهرياً. أي استراتيجية alerting تتجنب التنبيه على الاضطرابات القصيرة ولا تفوت استنزاف error budget البطيء؟

## Options

- تنبيه ثابت واحد عند 1% أخطاء
- Multi-window burn-rate alerts
- إيقاف التنبيهات ليلاً
- تنبيه لكل خطأ منفرد

## Solution

**Multi-window burn-rate alerts** هي الإجابة الصحيحة: تقيس burn rate سرعة استهلاك error budget. تجمع التنبيهات بين نافذة قصيرة وطويلة لالتقاط الحوادث الحادة والتدهور البطيء مع عدد قليل من false positives.
