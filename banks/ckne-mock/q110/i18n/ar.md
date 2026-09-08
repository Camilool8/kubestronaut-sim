## Question

في Istio، أي مورد ووضع يجبران كل الحركة الداخلة إلى workloads في namespace على mTLS ويرفضان plaintext؟

## Options

- NetworkPolicy بحقل tls
- Gateway مع allowInsecure: false
- PeerAuthentication مع mtls.mode: STRICT
- DestinationRule مع tls: DISABLE

## Solution

**PeerAuthentication مع mtls.mode: STRICT** هي الإجابة الصحيحة: يجعل `PeerAuthentication STRICT` الـ sidecars أو ztunnel تقبل mTLS فقط على مستوى namespace أو mesh. أما PERMISSIVE فيقبل mTLS وplaintext معاً، وهو مناسب للانتقال لا للوضع النهائي في production.
