**It receives NO new requests** is correct: Weight zero = fraction 0 of the traffic. It's intentionally valid: it keeps the backend "plugged in" so you can flip traffic instantly (0↔100) without editing the route structure.

Why the others are wrong:

- **It still receives half the traffic** — weights are proportional: 0 out of the total is no share at all, not an implicit equal split.
- **The route is rejected** — a zero weight is a valid, documented value and the route stays Accepted.
- **weight: 0 is invalid** — weights range from 0 to 1,000,000; zero is explicitly permitted so a backend can be kept attached but idle.
