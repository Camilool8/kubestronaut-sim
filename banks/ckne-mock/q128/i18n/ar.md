## Question

يحاول containerان داخل pod نفسه الاستماع على المنفذ 8080. ماذا يحدث؟

## Options

- يعمل لأن لكل container network namespace مستقلة
- ينشئ kubelet عنوان IP ثانياً
- تتوازن الحركة بينهما
- يفشل الثاني بخطأ address already in use

## Solution

**يفشل الثاني بخطأ address already in use** هي الإجابة الصحيحة: تشترك كل containers في pod في network namespace الخاصة بالـ sandbox أو pause container. لذلك يعمل localhost بينها، لكنها تتنافس على المنافذ نفسها.
