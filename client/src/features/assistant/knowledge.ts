/**
 * The offline helper's built-in answers. Each topic lists the words and phrases that
 * point to it; the helper picks the topic whose words best match the question.
 * Answers are short markdown texts written for this course.
 */

/** One topic the offline helper can answer. */
export interface Topic {
  id: string;
  /** Words or short phrases that suggest this topic. Phrases count more than words. */
  keywords: string[];
  /** The answer, in light markdown (paragraphs, lists, **bold**, `code`). */
  answer: string;
}

/** All built-in topics. */
export const TOPICS: ReadonlyArray<Topic> = [
  {
    id: 'what-is-ec',
    keywords: [
      'elliptic curve',
      'what is an elliptic',
      'curve equation',
      'weierstrass',
      'what is ecc',
    ],
    answer:
      'An **elliptic curve** over a prime field is the set of points (x, y) with\n`y² ≡ x³ + ax + b (mod p)`, together with one extra point O, the point at infinity.\nIts points can be **added**, and that addition makes them a group. Elliptic curve cryptography (ECC) is built on that group.',
  },
  {
    id: 'prime',
    keywords: ['prime', 'why p prime', 'composite', 'p must be', 'modulus'],
    answer:
      'p must be **prime** because every addition divides by something (the slope is a fraction). Mod a prime, every number except 0 has an inverse, so the division always works.\nAlso p must be greater than 3: for p = 2 and p = 3 the short form y² = x³ + ax + b does not cover all elliptic curves.',
  },
  {
    id: 'singular',
    keywords: [
      'singular',
      'discriminant',
      '4a³',
      '4a^3',
      '27b',
      'cusp',
      'non-singular',
      'nonsingular',
    ],
    answer:
      'A curve is **singular** when `4a³ + 27b² ≡ 0 (mod p)`. Then x³ + ax + b has a repeated root and the curve has a cusp or crosses itself. The tangent is not defined at that point, so the addition rule breaks and the points do not form a group. That is why the app refuses such curves.',
  },
  {
    id: 'infinity',
    keywords: ['infinity', 'point at infinity', 'identity', 'neutral', 'what is o', 'zero point'],
    answer:
      'The **point at infinity O** is the identity of the group: `P + O = P` for every point P.\nIt is also the result whenever the line through the two points is vertical:\n- `P + (−P) = O`\n- `2P = O` when P has y = 0\n- `kP = O` when k is a multiple of the order of P.',
  },
  {
    id: 'negation',
    keywords: ['inverse point', 'negative point', 'minus p', '-p', 'negation', 'mirror'],
    answer:
      'The inverse of P = (x, y) is **−P = (x, −y mod p)**, its mirror image. On the plot the mirror line is y = p/2. A point and its inverse add up to O.',
  },
  {
    id: 'addition',
    keywords: ['add points', 'addition', 'chord', 'p + q', 'p+q', 'adding two', 'sum'],
    answer:
      'To add two different points P = (x₁, y₁) and Q = (x₂, y₂):\n1. Slope: `λ = (y₂ − y₁) / (x₂ − x₁) mod p`\n2. `x₃ = λ² − x₁ − x₂ mod p`\n3. `y₃ = λ(x₁ − x₃) − y₁ mod p`\nIf x₁ = x₂ and y₁ + y₂ ≡ 0, the sum is O instead. The Add points tab shows every step.',
  },
  {
    id: 'doubling',
    keywords: ['double', 'doubling', 'tangent', '2p', 'p + p', 'same point'],
    answer:
      'To **double** P = (x₁, y₁), use the tangent slope `λ = (3x₁² + a) / (2y₁) mod p`, then the same formulas as for addition:\n`x₃ = λ² − 2x₁`, `y₃ = λ(x₁ − x₃) − y₁`.\nIf y₁ = 0 the tangent is vertical and 2P = O.',
  },
  {
    id: 'inverse',
    keywords: [
      'modular inverse',
      'inverse of',
      'euclid',
      'extended euclidean',
      'divide mod',
      'division mod',
      'inverse mod',
    ],
    answer:
      'Dividing mod p means multiplying by an **inverse**: d⁻¹ is the number with `d · d⁻¹ ≡ 1 (mod p)`.\nThe **extended Euclidean algorithm** finds it: divide repeatedly (p = q·d + r, then d = q·r + r′, …) until the remainder is 1, keeping a coefficient t on each line. The t on the line with remainder 1 is the inverse. The app shows this table in step 3 of every addition.\nTip: ask "inverse of 6 mod 23" and I will compute one.',
  },
  {
    id: 'euler',
    keywords: [
      'euler',
      'criterion',
      'quadratic residue',
      'square root',
      'tonelli',
      'shanks',
      'legendre',
      'is a square',
    ],
    answer:
      'To list the points, the app needs √(x³ + ax + b) mod p for each x.\n- **Euler’s criterion**: n is a non-zero square mod p exactly when `n^((p−1)/2) ≡ 1`.\n- **Tonelli-Shanks** then finds a root y. The two points are (x, y) and (x, p − y).\nThis takes about p steps instead of p² for trying every (x, y).',
  },
  {
    id: 'hasse',
    keywords: [
      'hasse',
      'number of points',
      'how many points',
      'count',
      'bound',
      'order of the curve',
    ],
    answer:
      '**Hasse’s theorem**: the number of points N (counting O) satisfies `|N − (p + 1)| ≤ 2√p`.\nSo a curve over p has roughly p points. The All points tab checks this for every curve it lists.',
  },
  {
    id: 'order',
    keywords: [
      'order of a point',
      'order of p',
      'point order',
      'generator',
      'cyclic',
      'subgroup',
      'lagrange',
    ],
    answer:
      'The **order** of a point P is the smallest n ≥ 1 with `nP = O`. By Lagrange’s theorem it divides N, the number of points.\nIf the order equals N, P **generates** the whole group: P, 2P, 3P, … visit every point. On E17(2, 2), P = (5, 1) has order 19 = N.\nUse **Animate multiples** in the Multiply tab to watch P, 2P, 3P, … until they reach O.',
  },
  {
    id: 'double-and-add',
    keywords: [
      'double-and-add',
      'double and add',
      'scalar',
      'multiply',
      'multiplication',
      'kp',
      'binary',
      'bits',
    ],
    answer:
      '**Double-and-add** computes kP quickly. Write k in binary and read it from the left:\n- the first bit sets R = P;\n- every later bit doubles R, and a 1 bit then also adds P.\nA 256-bit k needs about 256 doublings and at most 256 additions, instead of k − 1 additions.',
  },
  {
    id: 'ecdlp',
    keywords: [
      'discrete log',
      'ecdlp',
      'why secure',
      'hard problem',
      'security of ecc',
      'break',
      'recover k',
    ],
    answer:
      'ECC is secure because of the **elliptic curve discrete logarithm problem**: given P and Q = kP, finding k is believed to be infeasible on a well-chosen 256-bit curve, even though computing kP is fast.\nOn the small classroom curves you can find k by trying every multiple, which is why real systems use huge primes.',
  },
  {
    id: 'ecdh',
    keywords: ['key exchange', 'diffie', 'ecdh', 'shared secret', 'public key', 'private key'],
    answer:
      'In **ECDH key exchange**, Alice and Bob agree on a curve and a base point G.\n1. Alice picks a secret a and sends A = aG; Bob picks b and sends B = bG.\n2. Alice computes aB and Bob computes bA; both equal abG, the shared secret.\nAn eavesdropper sees G, A and B but would need to solve the discrete logarithm problem to get the secret.',
  },
  {
    id: 'real-curves',
    keywords: [
      'secp256k1',
      'p-256',
      'p256',
      'bitcoin',
      'nist',
      'real curve',
      'real life',
      '256-bit',
      '256 bit',
    ],
    answer:
      'Two real curves are in the example list:\n- **secp256k1**: y² = x³ + 7, used by Bitcoin and Ethereum.\n- **NIST P-256**: used by most HTTPS connections.\nBoth have a 256-bit p. Adding and multiplying work on them in the app; listing all points does not, since there are about 10⁷⁷ of them.',
  },
  {
    id: 'reduce',
    keywords: ['reduce', 'reduced', 'negative number', 'mod p', 'remainder', 'outside'],
    answer:
      'Every value is **reduced mod p** into 0 … p − 1. A negative number is lifted by adding p: −3 mod 23 = 20. That is why a = −1 is shown as p − 1, and why the steps show lines like "−164 ≡ 20 (mod 23)".',
  },
  {
    id: 'hex',
    keywords: ['hex', 'hexadecimal', '0x', 'format'],
    answer:
      'You can type numbers in **hexadecimal** by starting them with `0x`, for example `0xFF`. Spaces, commas and underscores between digits are ignored. Results are always shown in decimal, like the hand method.',
  },
  {
    id: 'app-security',
    keywords: [
      'real keys',
      'my keys',
      'safe to use',
      'secure for',
      'timing',
      'side channel',
      'production',
      'real secrets',
      'wallet',
    ],
    answer:
      '**Do not use OnCurve for real keys or secrets.** It is a learning tool: the calculations are written to be easy to follow, not to resist attacks. In particular they are not constant-time, so their running time depends on the numbers, which an attacker could measure.',
  },
  {
    id: 'limits',
    keywords: ['limit', 'too large', 'cannot list', 'maximum', 'slow', 'why can i not'],
    answer:
      'Listing every point works up to p = 200,000 (about a second). Adding and multiplying work for any prime up to 1024 bits. The full list is on the **Limitations** page.',
  },
  {
    id: 'how-to',
    keywords: ['how to use', 'get started', 'where do i start', 'how do i use', 'tour', 'tutorial'],
    answer:
      'Start on the **Explorer** page:\n1. Pick an example curve or type p, a and b.\n2. **All points** lists the curve, **Add points** computes P + Q, **Multiply** computes kP.\n3. Every result shows its steps below it.\nThe guided tour (Display settings or the Help page) shows where everything is.',
  },
];

/** Words that show a question is about this subject at all. */
export const SUBJECT_WORDS: ReadonlyArray<string> = [
  'curve',
  'point',
  'points',
  'prime',
  'mod',
  'modulo',
  'modular',
  'inverse',
  'add',
  'addition',
  'double',
  'multiply',
  'scalar',
  'slope',
  'lambda',
  'λ',
  'infinity',
  'order',
  'group',
  'field',
  'ecc',
  'elliptic',
  'key',
  'hasse',
  'euclid',
  'euler',
  'singular',
  'secp256k1',
  'p-256',
  'bits',
  'binary',
  'app',
  'oncurve',
  'tab',
  'result',
  'step',
  'steps',
  'explain',
  'help',
  'hex',
  'generator',
  'tangent',
  'chord',
  'formula',
  'crypto',
  'cryptography',
  'security',
  'secure',
  'diffie',
  'ecdh',
  'discrete',
  'log',
  'square',
  'root',
  'residue',
  'x3',
  'y3',
  'tour',
];
