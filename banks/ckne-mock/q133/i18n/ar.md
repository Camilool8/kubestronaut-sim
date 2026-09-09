## Question

عند حذف pod، أي عملية CNI تُستدعى، وماذا يحدث إذا أعيد تشغيل العقدة قبل تنفيذها؟

## Options

- CNI DEL، وبدونها قد تبقى IP leases يتيمة في IPAM
- CNI FLUSH وetcd يحذف IP
- لا عملية لأن kernel ينظف كل شيء
- CNI REMOVE ولا يحدث شيء

## Solution

**CNI DEL، وبدونها قد تبقى IP leases يتيمة في IPAM** هي الإجابة الصحيحة: يستدعي runtime ‏`CNI_COMMAND=DEL` عند الحذف. قد تتجاوز الأعطال هذه الخطوة، فتترك leases شبحية في `/var/lib/cni/networks` وتظهر لاحقاً رسالة no IP addresses available.
