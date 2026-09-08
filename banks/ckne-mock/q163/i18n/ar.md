## Question

تبلغ التطبيقات عن DNS timeouts متقطعة مدتها بالضبط 5 ثوان تحت الحمل. ما السبب التقليدي والتخفيف؟

## Options

- كابل شبكة سيئ
- CoreDNS بطيء دائماً تحت الحمل
- TTL صفر من upstream
- race condition في conntrack مع استعلامات UDP متوازية

## Solution

**race condition في conntrack مع استعلامات UDP متوازية** هي الإجابة الصحيحة: تنتج ظاهرة الخمس ثوان من drops بسبب race عند إدخال اتصالات UDP في conntrack. يزيل NodeLocal DNSCache مسار NAT محلياً ويتصل upstream عبر TCP، وهو الحل الهيكلي الموصى به.
