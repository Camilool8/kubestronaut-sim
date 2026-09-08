## Question

تريد تعريض قاعدة PostgreSQL على TCP/5432 عبر Gateway مع توجيه L4. أي مورد في Gateway API تستخدم؟

## Options

- TCPRoute مربوط بـ TCP listener على Gateway
- UDPRoute
- HTTPRoute مع path باسم /postgres
- GRPCRoute

## Solution

**TCPRoute مربوط بـ TCP listener على Gateway** هي الإجابة الصحيحة: يوجه `TCPRoute` اتصالات TCP العامة من listener إلى backendRefs دون semantics خاصة بـ HTTP. توجد أيضاً UDPRoute وTLSRoute وGRPCRoute للبروتوكولات المناسبة.
