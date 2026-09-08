## Question

أي أمر Hubble يعرض في الوقت الحقيقي فقط flows ذات verdict ‏DROPPED والسبب مثل Policy denied؟

## Options

- hubble observe --verdict DROPPED
- kubectl logs cilium
- hubble encrypt --all --follow
- hubble delete flows --verdict ALL

## Solution

**hubble observe --verdict DROPPED** هي الإجابة الصحيحة: يعرض `hubble observe --verdict DROPPED` المصدر والوجهة والمنفذ وسبب الإسقاط، مثل Policy denied أو connection tracking، وهو أسرع طريق لمعرفة NetworkPolicy التي تحجب flow.
