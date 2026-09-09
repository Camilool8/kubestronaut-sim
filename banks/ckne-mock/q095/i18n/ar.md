## Question

عند إعلان VIP نفسه لـ LoadBalancer عبر BGP من عدة عقد، أي آلية في router توزع الحركة بينها؟

## Options

- ECMP أو Equal-Cost Multi-Path
- Reverse NAT في edge router
- DNS round-robin مع TTL منخفض
- STP بين switches

## Solution

**ECMP أو Equal-Cost Multi-Path** هي الإجابة الصحيحة: يختار ECMP عقدة معلنة لكل flow حسب hash للـ 5-tuple، فيوفر موازنة على مستوى الشبكة وتقارباً سريعاً عند توقف عقدة عن الإعلان. يسرع BFD اكتشاف الفشل.
