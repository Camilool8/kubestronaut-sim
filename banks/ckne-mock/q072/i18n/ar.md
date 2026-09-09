## Question

ما أحدث backend في kube-proxy صُمم لاستبدال iptables بأداء أفضل وAPI أحدث في kernel؟

## Options

- socketd
- ebtables
- nftables
- tc

## Solution

**nftables** هي الإجابة الصحيحة: يستخدم وضع `nftables` واجهة kernel الحديثة التي خلفت iptables، ويجعل تحديث القواعد أكثر كفاءة في clusters ذات Services كثيرة. يبقى eBPF عبر Cilium بديلاً خارج kube-proxy.
