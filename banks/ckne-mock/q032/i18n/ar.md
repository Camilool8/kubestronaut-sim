## Question

تنقطع طلبات streaming عبر SSE من LLM خلف Gateway بعد نحو 30 ثانية. ما الإصلاح الصحيح؟

## Options

- زيادة request وidle timeouts في Gateway أو HTTPRoute
- تعطيل TLS لتقليل handshake
- خفض keepalive في kernel
- تغيير Service إلى UDP

## Solution

**زيادة request وidle timeouts في Gateway أو HTTPRoute** هي الإجابة الصحيحة: تضع proxies timeouts افتراضية بين 30 و60 ثانية. يحتاج token streaming إلى رفع `timeouts.request` و`backendRequest` أو ما يعادلهما، مع تعطيل buffering لـ SSE.
