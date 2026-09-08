## Question

متى تستخدم TLS Passthrough عبر TLSRoute بدلاً من Terminate على Gateway؟

## Options

- عندما يجب أن ينهي backend اتصال TLS بنفسه
- عندما لا توجد شهادة لدى backend
- Passthrough مخصص فقط لـ UDP
- دائماً لأنه أسرع

## Solution

**عندما يجب أن ينهي backend اتصال TLS بنفسه** هي الإجابة الصحيحة: في `Passthrough` يقرأ Gateway فقط SNI من ClientHello ويمرر البيانات المشفرة. تفقد التوجيه حسب path أو header لغياب رؤية L7، لكن تبقى الشهادة تحت سيطرة backend.
