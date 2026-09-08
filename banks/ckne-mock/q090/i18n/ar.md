## Question

ما العناصر الثلاثة الأساسية في CiliumEgressGatewayPolicy؟

## Options

- selectors وdestinationCIDRs وegressGateway مع egressIP
- اسم المورد وnamespace وlabels وannotations
- port وtargetPort وnodePort
- ingress وegress وpolicyTypes

## Solution

**selectors وdestinationCIDRs وegressGateway مع egressIP** هي الإجابة الصحيحة: تطابق policy الحركة من pods المحددة إلى destination CIDRs، ثم تعيد توجيهها إلى gateway node التي تنفذ SNAT إلى `egressIP`، ما يوفر عنوان خروج ثابتاً وقابلاً للتدقيق.
