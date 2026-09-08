## Question

أي filter في HTTPRoute يضيف header مثل X-Env: prod إلى كل طلب يرسل إلى backend؟

## Options

- requestHeaderModifier
- corsPolicy
- urlRewrite
- requestMirror

## Solution

**requestHeaderModifier** هي الإجابة الصحيحة: يضيف `RequestHeaderModifier` headers أو يعدلها أو يحذفها في مسار الطلب. يغيّر URLRewrite hostname أو path، بينما ينسخ RequestMirror الحركة إلى backend آخر.
