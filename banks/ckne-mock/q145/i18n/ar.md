## Question

ماذا يطابق HTTPRoute لا يحتوي أي matches على الإطلاق؟

## Options

- لا شيء لأن matches إلزامي
- كل الحركة المتوافقة مع hostname أو listener
- GET / فقط
- HTTPS فقط

## Solution

**كل الحركة المتوافقة مع hostname أو listener** هي الإجابة الصحيحة: عند غياب matches يُفترض `PathPrefix /`. ومع قواعد الأولوية قد يعمل كـ catch-all، لذلك يمكن لroute موضوعة في المكان الخطأ أن تخدم طلبات غير متوقعة.
