## Question

أي مورد استبدل كائن Endpoints كآلية رئيسية قابلة للتوسع لتتبع backends الخاصة بـ Service؟

## Options

- EndpointSlice
- PodDisruptionBudget
- BackendConfig
- ServiceEntry

## Solution

**EndpointSlice** هي الإجابة الصحيحة: يقسم `EndpointSlice` endpoints إلى شرائح، افتراضياً حتى 100 endpoint لكل شريحة، ما يقلل كلفة التحديث في Services الكبيرة ويضيف معلومات topology مثل zone وnode. بقي Endpoints للتوافق.
