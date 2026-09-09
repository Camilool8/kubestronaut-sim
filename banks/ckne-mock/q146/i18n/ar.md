## Question

ضبطت canary بوزنين 90/10 وقاعدة توجه header ‏x-beta: true إلى v2، لكن مستخدماً يحمل header يصل أحياناً إلى v1. ماذا تراجع؟

## Options

- المتصفح يحذف headers
- لا تدعم Gateway API مطابقة headers
- هل header match موجودة في القاعدة نفسها التي تحتوي weights
- weights تفوز دائماً على headers

## Solution

**هل header match موجودة في القاعدة نفسها التي تحتوي weights** هي الإجابة الصحيحة: يجب أن تكون canary المعتمدة على header في rule منفصلة وأكثر تحديداً، وتبقى rule ذات weights كـ fallback. دمج المطابقة والأوزان في rule واحدة يجعل المستخدم يدخل الموازنة الاحتمالية.
