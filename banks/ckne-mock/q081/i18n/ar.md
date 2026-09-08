## Question

ماذا يفعل الحقل internalTrafficPolicy: Local في Service؟

## Options

- يحجب كل حركة قادمة من خارج الكلاستر
- يستبدل CoreDNS
- يرسل الحركة الداخلية فقط إلى endpoints الموجودة على عقدة العميل
- يفعل mTLS داخلياً

## Solution

**يرسل الحركة الداخلية فقط إلى endpoints الموجودة على عقدة العميل** هي الإجابة الصحيحة: هو النظير الداخلي لـ externalTrafficPolicy. يفيد مع daemons لكل عقدة، مثل log agent أو node-local cache، بحيث يتصل كل pod بالنسخة الموجودة على عقدته ويقلل القفزات والـ latency.
