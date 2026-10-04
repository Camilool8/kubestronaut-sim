# CKNE Mock Exam bank

170 original multiple-choice questions, of which 75 are drawn at random
for each attempt (`spec.examLength`): 90 minutes, 66% to pass,
single-answer items, every question tagged to a curriculum domain.
Domain weights are enforced on every draw (`exam.DrawMCQ` stratifies
the sample so it always lands on the published blueprint: Core
Infrastructure and CNI 15%, Service Networking and DNS 25%, Advanced
Traffic Management 20%, Network Security and Policy 25%,
Observability 15%).

**The real CKNE is a performance-based exam.** This bank drills the
knowledge behind it — CNI, IPAM, kube-proxy, CoreDNS, Gateway API,
NetworkPolicy, mTLS, egress and multi-cluster patterns, network
observability — in the multiple-choice engine, and does not rehearse
the hands-on tasks. The exam's duration and passing score had not been
published by the Linux Foundation when this bank was written; the
figures above are this bank's own.

Every question was written for this project. Nothing here reproduces
content from the actual exam (which is confidential under the Linux
Foundation's exam terms) or from any commercial question bank.

Questions authored by Diego Machado; adapted to this simulator's bank
format from the author's multilingual offline study app. The domain
taxonomy, weights and competency list come from the
[CKNE program page](https://training.linuxfoundation.org/kubernetes-network-engineer-program/).
CKNE and Kubernetes are trademarks of their respective owners; this
project is not affiliated with or endorsed by the CNCF or the Linux
Foundation — see the note in the lobby.

## Languages

The bank is written in English and ships every question in six more
languages as `<qid>/i18n/<lang>.md` (`spec.translations`): Portuguese
(the language the questions were first written in), Spanish, German,
French, Russian and Arabic. The candidate picks one on the mode screen
before the clock starts; questions, options, explanations and the
graded review come back in it, with the same option order and the same
answer key in every language. The interface around the question stays
in English, and Arabic renders right-to-left. `tests/bank-mcq.sh`
verifies every translation is present and complete.

Authoring rules for this bank live in
[docs/bank-spec.md](../../docs/bank-spec.md) and are enforced offline by
`tests/bank-mcq.sh`.
