## Question

تشير ExternalName Service إلى api.partner.com لكن العملاء يتصلون بـ https://my-alias.default.svc.cluster.local ويفشل TLS. لماذا؟

## Options

- CoreDNS يحجب TLS
- ExternalName لا يدعم HTTPS أو TLS passthrough
- ينقص NodePort على 443
- شهادة الهدف صالحة لـ api.partner.com، فيحدث SAN mismatch

## Solution

**شهادة الهدف صالحة لـ api.partner.com، فيحدث SAN mismatch** هي الإجابة الصحيحة: يتحقق TLS باستخدام الاسم الذي طلبه العميل. استخدم الاسم الحقيقي، أو اضبط SNI والتحقق بشكل صحيح، أو ضع proxy يعيد كتابة Host وSNI.
