/**
 * server/constants/quizQuestionBanks.js
 * ============================================================================
 * CANONICAL SKILL-SPECIFIC QUIZ QUESTION BANKS — NEXUSFLOW V4.0
 *
 * Provides extensive, semantically differentiated question pools (15+ questions
 * per skill) for canonical skills:
 *   - Cryptography (AES, RSA, ECC, hashing, digital signatures, PKI, HMAC, etc.)
 *   - Network Security (Firewalls, IDS/IPS, VPN, TLS, segmentation, WAF, etc.)
 *   - Cybersecurity (CIA triad, auth vs authz, malware, phishing, risk, threat modeling)
 *   - Frontend (DOM, React, CSS, state management, bundle optimization)
 *   - Backend (Node.js, REST, microservices, concurrency, caching)
 *   - Docker / DevOps (Containers, images, CI/CD, Kubernetes, orchestration)
 *   - Testing (Unit, integration, mocking, TDD, regression, coverage)
 *   - JavaScript (Event loop, closures, promises, prototypes, scoping)
 *   - Python (GIL, decorators, generators, data structures, OOP)
 *   - SQL / Database (ACID, indexing, normalization, joins, transactions)
 * ============================================================================
 */

export const CANONICAL_SKILL_MAP = {
  // Cryptography
  cryptography: "cryptography",
  crypto: "cryptography",
  "cryptographic protocols": "cryptography",
  encryption: "cryptography",

  // Network Security
  "network-security": "network_security",
  network_security: "network_security",
  "network security": "network_security",
  networksecurity: "network_security",

  // Cybersecurity
  cybersecurity: "cybersecurity",
  cyber_security: "cybersecurity",
  "cyber security": "cybersecurity",
  "information security": "cybersecurity",
  infosec: "cybersecurity",

  // Frontend
  frontend: "frontend",
  "front-end": "frontend",
  react: "frontend",
  "react.js": "frontend",
  "ui development": "frontend",

  // Backend
  backend: "backend",
  "back-end": "backend",
  nodejs: "backend",
  "node.js": "backend",

  // Docker / DevOps
  docker: "docker",
  devops: "docker",
  kubernetes: "docker",
  cicd: "docker",
  "ci/cd": "docker",

  // Testing
  testing: "testing",
  qa: "testing",
  "quality assurance": "testing",
  automation: "testing",

  // JavaScript
  javascript: "javascript",
  js: "javascript",
  typescript: "javascript",
  ts: "javascript",

  // Python
  python: "python",
  python3: "python",

  // SQL / Database
  sql: "sql",
  database: "sql",
  "database design": "sql",
  postgresql: "sql",
  mongodb: "sql",
};

export function resolveCanonicalSkillId(raw) {
  if (!raw) return "javascript";
  const cleaned = String(raw).trim().toLowerCase().replace(/[_\s-]+/g, "-");
  if (CANONICAL_SKILL_MAP[cleaned]) return CANONICAL_SKILL_MAP[cleaned];
  const directKey = String(raw).trim().toLowerCase().replace(/[-_]+/g, " ");
  if (CANONICAL_SKILL_MAP[directKey]) return CANONICAL_SKILL_MAP[directKey];
  const underscoreKey = String(raw).trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (CANONICAL_SKILL_MAP[underscoreKey]) return CANONICAL_SKILL_MAP[underscoreKey];

  for (const [alias, canonical] of Object.entries(CANONICAL_SKILL_MAP)) {
    if (cleaned.includes(alias)) return canonical;
  }
  return "javascript";
}

export const SKILL_QUESTION_POOLS = {
  cryptography: [
    {
      question: "Which of the following is a symmetric key encryption standard?",
      options: ["RSA", "AES", "ECC", "Diffie-Hellman"],
      correctIndex: 1,
      explanation: "AES (Advanced Encryption Standard) is a widely used symmetric block cipher with key lengths of 128, 192, or 256 bits.",
    },
    {
      question: "What primary mathematical problem underpins the security of standard RSA encryption?",
      options: ["Discrete logarithm in elliptic curves", "Prime factorization of large composite integers", "Shortest vector problem", "Subset sum problem"],
      correctIndex: 1,
      explanation: "RSA derives its security from the computational difficulty of factoring large integers that are the product of two large prime numbers.",
    },
    {
      question: "Which property distinguishes cryptographic hash functions from standard checksums?",
      options: ["Reversible mapping", "Collision resistance and one-way pre-image resistance", "Variable output length", "Symmetric key requirement"],
      correctIndex: 1,
      explanation: "Cryptographic hash functions are one-way functions designed to make finding collisions or pre-images computationally infeasible.",
    },
    {
      question: "What is the primary role of a Digital Signature in cryptography?",
      options: ["Encrypting message payloads for confidentiality", "Providing authenticity, integrity, and non-repudiation", "Generating session keys symmetrically", "Compressing network packets"],
      correctIndex: 1,
      explanation: "Digital signatures use private keys to sign a message hash, guaranteeing sender authenticity, data integrity, and non-repudiation.",
    },
    {
      question: "Why does Elliptic Curve Cryptography (ECC) provide an advantage over traditional RSA?",
      options: ["It does not require public keys", "It achieves equivalent cryptographic strength with significantly smaller key sizes", "It is immune to quantum attacks", "It only operates symmetrically"],
      correctIndex: 1,
      explanation: "A 256-bit ECC key offers comparable security to a 3072-bit RSA key, drastically reducing computational overhead and bandwidth.",
    },
    {
      question: "In Public Key Infrastructure (PKI), who issues and digitally signs digital certificates?",
      options: ["DNS Registrar", "Certificate Authority (CA)", "Network Gateway Router", "Client Browser"],
      correctIndex: 1,
      explanation: "A trusted Certificate Authority (CA) validates identity and signs certificates binding public keys to specific domain identities.",
    },
    {
      question: "What is the fundamental purpose of the Diffie-Hellman protocol?",
      options: ["Secure digital signature generation", "Securely establishing a shared secret over an insecure channel", "Symmetric file compression", "Malware scanning"],
      correctIndex: 1,
      explanation: "Diffie-Hellman key exchange enables two parties to negotiate a shared secret without ever transmitting the secret across the wire.",
    },
    {
      question: "What distinguishes HMAC (Hash-based Message Authentication Code) from a plain hash like SHA-256?",
      options: ["HMAC incorporates a secret cryptographic key alongside the message", "HMAC produces encrypted ciphertext", "HMAC does not use hashing algorithms", "HMAC is strictly reversible"],
      correctIndex: 0,
      explanation: "HMAC combines a secret key with a cryptographic hash function to verify both data integrity and the authentic origin of the message.",
    },
    {
      question: "What is 'Perfect Forward Secrecy' (PFS) in cryptographic session negotiations?",
      options: ["Encrypting backups with multiple master passwords", "Compromise of long-term server private keys does not compromise past session traffic", "Pre-generating all future symmetric keys during initial installation", "Permanently storing keys in hardware security modules"],
      correctIndex: 1,
      explanation: "PFS generates ephemeral session keys per handshake so that a future private key compromise cannot decrypt past recorded traffic.",
    },
    {
      question: "In block cipher modes of operation, why is ECB (Electronic Codebook) mode considered insecure for structured data?",
      options: ["It requires too many initialization vectors", "Identical plaintext blocks always encrypt into identical ciphertext blocks, preserving patterns", "It only supports 64-bit keys", "It cannot be decrypted"],
      correctIndex: 1,
      explanation: "ECB encrypts each block independently, leaking structural patterns of the underlying plaintext (famous 'ECB penguin' effect).",
    },
    {
      question: "What is an Initialization Vector (IV) and why is it used in CBC mode?",
      options: ["A private key kept secret on the server", "A non-repeating nonce used to ensure distinct ciphertext for identical plaintexts", "A certificate validation checksum", "A hardware acceleration instruction"],
      correctIndex: 1,
      explanation: "An IV provides initial entropy so that encrypting the same plaintext twice with the same key produces completely distinct ciphertexts.",
    },
    {
      question: "Which cryptographic algorithm is universally recognized as broken due to practical collision attacks?",
      options: ["SHA-256", "AES-GCM", "MD5", "ChaCha20"],
      correctIndex: 2,
      explanation: "MD5 (and SHA-1) have demonstrated practical collision vulnerabilities and must not be used for cryptographic security.",
    },
    {
      question: "What is the primary objective of Authenticated Encryption with Associated Data (AEAD) like AES-GCM?",
      options: ["Combining confidentiality and integrity verification in a single cryptographic operation", "Generating asymmetric key pairs automatically", "Hashing database passwords with salt", "Disabling block padding entirely"],
      correctIndex: 0,
      explanation: "AEAD modes (such as AES-GCM) provide simultaneous data confidentiality and cryptographic authenticity verification.",
    },
    {
      question: "What is a Zero-Knowledge Proof (ZKP) in modern cryptography?",
      options: ["A method where the server stores no password hashes", "A cryptographic method where a prover demonstrates knowledge of a truth without revealing any information beyond the validity of the truth", "An encryption algorithm with zero secret keys", "A brute-force vulnerability test"],
      correctIndex: 1,
      explanation: "ZKP allows a prover to prove possession of a secret or truth to a verifier without disclosing the secret itself.",
    },
    {
      question: "Why should cryptographic password hashing use algorithms like bcrypt or Argon2 instead of fast hashes like SHA-256?",
      options: ["SHA-256 is not deterministic", "Bcrypt and Argon2 are intentionally computationally intensive and memory-hard, mitigating GPU/ASIC brute-force attacks", "Argon2 is an asymmetric encryption cipher", "Fast hashes cannot handle special characters"],
      correctIndex: 1,
      explanation: "Argon2 and bcrypt feature configurable work factors and memory hardness designed specifically to slow down offline password cracking.",
    },
  ],

  network_security: [
    {
      question: "What is the primary difference between a Stateful Firewall and a Stateless Packet Filter?",
      options: ["Stateless filters inspect SSL payloads", "Stateful firewalls track the connection state of active network flows and context", "Stateful firewalls only operate at Layer 2", "Stateless filters cannot filter by IP address"],
      correctIndex: 1,
      explanation: "Stateful firewalls maintain a state table tracking TCP handshakes and sequence numbers, allowing return traffic for established sessions.",
    },
    {
      question: "What is the primary operational distinction between an IDS and an IPS?",
      options: ["An IDS monitors and alerts, while an IPS actively sits in-line to detect and drop malicious traffic", "An IDS only inspects hardware addresses", "An IPS cannot inspect IP packets", "An IDS is exclusively host-based while an IPS is exclusively cloud-based"],
      correctIndex: 0,
      explanation: "An Intrusion Detection System (IDS) alerts administrators to anomalies, whereas an Intrusion Prevention System (IPS) actively blocks malicious packets.",
    },
    {
      question: "During a TLS 1.3 handshake, which key exchange mechanism is mandated to ensure forward secrecy?",
      options: ["Static RSA key transport", "Ephemeral Diffie-Hellman (ECDHE / DHE)", "Plain HTTP authentication", "Pre-shared master passwords in DNS records"],
      correctIndex: 1,
      explanation: "TLS 1.3 deprecated static RSA key exchange in favor of ephemeral Diffie-Hellman key exchanges (ECDHE) to enforce forward secrecy.",
    },
    {
      question: "What security concept isolates critical internal servers into separate broadcast domains to limit lateral attacker movement?",
      options: ["Network Address Translation (NAT)", "Network Segmentation (VLANs and Micro-segmentation)", "Port Forwarding", "Dynamic DNS"],
      correctIndex: 1,
      explanation: "Network segmentation divides networks into subnetworks/VLANs, applying strict access controls to prevent lateral compromise.",
    },
    {
      question: "What type of attack involves an adversary intercepting and relaying communications between two unsuspecting parties?",
      options: ["Buffer Overflow", "Man-in-the-Middle (MitM)", "SQL Injection", "Cross-Site Scripting"],
      correctIndex: 1,
      explanation: "A Man-in-the-Middle (MitM) attack intercepts traffic (e.g. via ARP spoofing or rogue Wi-Fi) to eavesdrop or alter data in transit.",
    },
    {
      question: "How does DNSSEC provide security to the Domain Name System?",
      options: ["By encrypting all DNS queries for total privacy", "By digitally signing DNS records to guarantee authenticity and integrity against spoofing", "By blocking all incoming UDP packets on port 53", "By automatically renewing expired domain registrations"],
      correctIndex: 1,
      explanation: "DNSSEC uses cryptographic signatures to validate that DNS lookup responses originate from the genuine authoritative nameserver.",
    },
    {
      question: "What is the primary defense against ARP Cache Poisoning attacks on a local area network?",
      options: ["Enabling Dynamic ARP Inspection (DAI) and DHCP Snooping on network switches", "Installing browser ad-blockers", "Increasing Wi-Fi transmit power", "Using private IPv4 addresses"],
      correctIndex: 0,
      explanation: "Dynamic ARP Inspection (DAI) validates ARP packets against trusted DHCP snooping bindings to drop forged ARP responses.",
    },
    {
      question: "What is the function of a Web Application Firewall (WAF) compared to a traditional network firewall?",
      options: ["A WAF inspects Layer 7 HTTP/HTTPS payloads for web attacks like SQLi, XSS, and command injection", "A WAF replaces Ethernet cables with fiber", "A WAF only filters Layer 3 IP headers", "A WAF encrypts operating system kernels"],
      correctIndex: 0,
      explanation: "A WAF inspects Layer 7 application traffic for web exploits (SQL injection, XSS, CSRF) that pass through standard port 443 firewalls.",
    },
    {
      question: "Which mechanism mitigates SYN Flood Denial of Service (DoS) attacks on Linux servers?",
      options: ["SYN Cookies", "Disabling TCP entirely", "Setting TCP timeout to zero", "Increasing packet MTU to 9000"],
      correctIndex: 0,
      explanation: "SYN cookies encode handshake state in the SYN-ACK sequence number, avoiding allocating server memory until the final ACK arrives.",
    },
    {
      question: "What is the primary function of IPsec in a site-to-site Virtual Private Network (VPN)?",
      options: ["Compressing video streams", "Providing authentication, integrity, and encryption for IP packets between network gateways", "Translating domain names to IP addresses", "Allocating dynamic DHCP addresses"],
      correctIndex: 1,
      explanation: "IPsec operates at the network layer to secure communications between endpoints with AH (integrity) and ESP (confidentiality).",
    },
    {
      question: "What is BGP Hijacking in global internet routing?",
      options: ["Intercepting Bluetooth transmissions", "Illegitimately advertising IP prefix ownership to redirect internet traffic through malicious autonomous systems", "Compromising DNS root servers", "Overheating fiber optic repeaters"],
      correctIndex: 1,
      explanation: "BGP hijacking occurs when a rogue Autonomous System announces unauthorized IP prefixes, causing routers worldwide to misroute traffic.",
    },
    {
      question: "Why is split tunneling in corporate VPN configurations considered a potential security risk?",
      options: ["It prevents users from connecting to the office printer", "User traffic can bypass corporate security inspection and allow compromised client machines to act as bridges into the corporate LAN", "It forces 100% of bandwidth through corporate gateways", "It breaks TLS certificate chains"],
      correctIndex: 1,
      explanation: "Split tunneling routes general internet traffic outside the VPN tunnel, creating an uninspected vector into the internal network.",
    },
    {
      question: "Which protocol should be used instead of Telnet for secure remote administrative access to network appliances?",
      options: ["FTP", "SSH", "SNMPv1", "HTTP"],
      correctIndex: 1,
      explanation: "SSH (Secure Shell) encrypts administrative traffic, preventing credential theft common with unencrypted Telnet sessions.",
    },
    {
      question: "What security benefit does 802.1X network access control provide?",
      options: ["Port-based authentication preventing unauthorized devices from connecting to physical switch ports or Wi-Fi", "Higher download throughput", "Automatic fiber optic switching", "DNS caching"],
      correctIndex: 0,
      explanation: "IEEE 802.1X requires credentials or certificates before a network switch port or wireless AP transitions to an authorized forwarding state.",
    },
    {
      question: "What is a DMZ (Demilitarized Zone) in network architecture?",
      options: ["A secure internal subnet with no internet access", "A perimeter subnetwork containing external-facing services isolated from the sensitive private internal network", "A testing network for beta firmware", "An offline storage array"],
      correctIndex: 1,
      explanation: "A DMZ exposes public services (web, mail) while shielding internal production databases and workstations behind an inner firewall.",
    },
  ],

  cybersecurity: [
    {
      question: "What are the three core pillars of the CIA Triad in information security?",
      options: ["Control, Identification, Auditing", "Confidentiality, Integrity, Availability", "Cryptography, Inspection, Access", "Certification, Incident, Authorization"],
      correctIndex: 1,
      explanation: "The CIA Triad consists of Confidentiality (preventing unauthorized disclosure), Integrity (preventing tampering), and Availability (ensuring timely access).",
    },
    {
      question: "What is the fundamental difference between Authentication and Authorization?",
      options: ["Authentication verifies who you are; Authorization determines what actions/resources you are permitted to access", "Authorization comes first to verify passwords", "Authentication is only for network cables", "They are completely synonymous in modern security"],
      correctIndex: 0,
      explanation: "Authentication proves an identity (e.g. username/password, biometric), while Authorization grants permissions based on that verified identity.",
    },
    {
      question: "Which security principle asserts that users and processes should only possess the minimum permissions required to perform their duties?",
      options: ["Security Through Obscurity", "Principle of Least Privilege (PoLP)", "Fail-Open Default", "Open Architecture"],
      correctIndex: 1,
      explanation: "The Principle of Least Privilege limits damage from accidental mistakes or malicious account takeover by granting only necessary access.",
    },
    {
      question: "What constitutes a 'Social Engineering' attack vector in cybersecurity?",
      options: ["Exploiting unpatched kernel buffer overflows", "Manipulating human psychology and trust to trick individuals into divulging confidential information", "Overclocking server hardware to bypass firewalls", "Cracking passwords using specialized rainbow tables"],
      correctIndex: 1,
      explanation: "Social engineering targets human vulnerabilities through deception (e.g. phishing, pretexting, baiting) rather than technical exploits.",
    },
    {
      question: "What is 'Defense-in-Depth' in security engineering?",
      options: ["Using only one ultra-strong firewall", "Implementing layered, redundant defensive controls across physical, network, host, and application tiers", "Burying data centers deep underground", "Restricting software development to compiled languages"],
      correctIndex: 1,
      explanation: "Defense-in-Depth ensures that if one defensive mechanism fails (e.g. perimeter firewall), secondary controls (e.g. MFA, EDR, encryption) prevent compromise.",
    },
    {
      question: "What is the purpose of Threat Modeling (e.g. using STRIDE) during early software design?",
      options: ["Calculating the financial price of developer licenses", "Systematically identifying potential security threats, vulnerabilities, and countermeasures before implementation", "Writing unit test mocks for database queries", "Running automated deployment scripts"],
      correctIndex: 1,
      explanation: "STRIDE threat modeling assesses Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, and Elevation of privilege during system architecture.",
    },
    {
      question: "What is a 'Zero-Day Vulnerability'?",
      options: ["A security flaw with zero risk to the organization", "A vulnerability that is actively known or exploited before the software vendor has released an official patch", "A vulnerability discovered on day zero of a sprint", "A flaw that takes zero seconds to exploit"],
      correctIndex: 1,
      explanation: "A zero-day vulnerability refers to a security defect unknown to the vendor (or unpatched), leaving defenders 'zero days' to prepare before potential exploitation.",
    },
    {
      question: "What distinguishes Ransomware from standard computer spyware?",
      options: ["Spyware deletes system files, while ransomware only steals cookies", "Ransomware encrypts victim files and systems, demanding payment for the decryption key", "Ransomware only affects mobile devices", "Spyware requires root privileges, ransomware does not"],
      correctIndex: 1,
      explanation: "Ransomware holds user data hostage by encrypting files and demanding ransom, directly threatening business availability and operations.",
    },
    {
      question: "Why is Multi-Factor Authentication (MFA) vastly superior to single-factor password protection?",
      options: ["It eliminates the need for any password", "It requires authentication from multiple independent categories: something you know, something you have, or something you are", "It reduces network latency", "It allows accounts to be shared safely among team members"],
      correctIndex: 1,
      explanation: "MFA requires verification across multiple factors (knowledge, possession, inherence), ensuring compromised passwords alone cannot yield unauthorized access.",
    },
    {
      question: "In Incident Response, what is the primary objective of the 'Containment' phase?",
      options: ["Blaming responsible employees", "Limiting the scope, blast radius, and spread of the security breach to prevent further damage", "Writing press releases immediately", "Purchasing new server hardware"],
      correctIndex: 1,
      explanation: "Containment isolates compromised hosts and revokes compromised credentials to stop the attacker's progression before eradication begins.",
    },
    {
      question: "What is Cross-Site Scripting (XSS) in web applications?",
      options: ["Executing malicious SQL statements against the backend database", "Injecting malicious client-side scripts into web pages viewed by other users", "Sniffing Wi-Fi packets on public routers", "Exhausting server RAM with infinite loops"],
      correctIndex: 1,
      explanation: "XSS occurs when an application includes untrusted data in a web page without proper escaping, allowing attacker scripts to run in victims' browsers.",
    },
    {
      question: "What is SQL Injection (SQLi) and how is it definitively prevented?",
      options: ["Injecting CSS to alter styles; prevented with media queries", "Manipulating database queries via unsanitized user inputs; prevented using parameterized queries and prepared statements", "Cracking database root passwords; prevented with firewalls", "Overloading database disk storage; prevented with cloud scaling"],
      correctIndex: 1,
      explanation: "SQLi manipulates raw query structure; using parameterized queries ensures inputs are always treated strictly as literal values, never executable SQL.",
    },
    {
      question: "What is the primary purpose of a SIEM (Security Information and Event Management) system?",
      options: ["Automating employee payroll", "Aggregating, correlating, and analyzing log data from diverse enterprise systems to detect anomalies and threats", "Backing up databases nightly", "Hosting company web portals"],
      correctIndex: 1,
      explanation: "A SIEM centralizes log telemetry across endpoints, firewalls, and servers to correlate events and surface actionable security alerts.",
    },
    {
      question: "What is Cross-Site Request Forgery (CSRF)?",
      options: ["An attacker tricking an authenticated victim's browser into executing unwanted actions on a trusted web application", "Stealing database tables via raw sockets", "Injecting keyloggers into BIOS", "Cracking Wi-Fi WPA2 pre-shared keys"],
      correctIndex: 0,
      explanation: "CSRF exploits the trust a web app has in an authenticated user's browser, transmitting unauthorized state-changing requests accompanied by ambient cookies.",
    },
    {
      question: "What role does an Endpoint Detection and Response (EDR) agent play in modern security operations?",
      options: ["Replacing all email servers", "Continuously monitoring endpoint behavioral activities, detecting advanced malware, and facilitating remote containment", "Generating random user passwords", "Formatting hard drives on schedule"],
      correctIndex: 1,
      explanation: "EDR tools continuously monitor host processes, network connections, and memory space to detect sophisticated adversary techniques in real time.",
    },
  ],

  frontend: [
    {
      question: "What is the Virtual DOM in React and why is it used?",
      options: ["A direct copy of the browser C++ engine", "An in-memory lightweight representation of the real DOM used to compute efficient diffs before batching updates", "A database for browser cookies", "A CSS preprocessor"],
      correctIndex: 1,
      explanation: "The Virtual DOM allows React to compute minimal state changes via reconciliation before modifying the computationally expensive browser DOM.",
    },
    {
      question: "In modern CSS, what is the primary distinction between Flexbox and CSS Grid?",
      options: ["Flexbox is 3D, CSS Grid is 2D", "Flexbox is designed for one-dimensional layouts (row or column), while CSS Grid is designed for two-dimensional layouts (rows and columns simultaneously)", "CSS Grid does not support responsive design", "Flexbox only works in Firefox"],
      correctIndex: 1,
      explanation: "Flexbox excels at linear 1D distribution along a single axis, whereas CSS Grid provides comprehensive 2D control across both horizontal and vertical axes.",
    },
    {
      question: "What is the purpose of React's `useCallback` hook?",
      options: ["Making asynchronous HTTP requests", "Memoizing a function definition between renders to prevent unnecessary re-creation and child re-renders", "Directly mutating DOM nodes", "Storing sensitive user passwords"],
      correctIndex: 1,
      explanation: "useCallback caches a callback instance across renders, preserving reference equality for props passed to optimized child components.",
    },
    {
      question: "What is 'Tree Shaking' in modern frontend build tools (Webpack, Vite, Rollup)?",
      options: ["A CSS animation technique", "Dead code elimination that removes unused JavaScript exports from the final bundled artifact", "Minifying image assets", "Restarting crashed development servers"],
      correctIndex: 1,
      explanation: "Tree shaking analyzes ES module import/export dependency graphs to omit unreferenced code from production bundles.",
    },
    {
      question: "What is the Critical Rendering Path in web browsers?",
      options: ["The sequence of steps: HTML parsing → DOM tree → CSSOM tree → Render Tree → Layout → Paint", "The path to the server backend API", "The user's mouse movement trail", "The Git branch workflow"],
      correctIndex: 0,
      explanation: "The Critical Rendering Path encompasses DOM and CSSOM construction, render tree creation, layout geometry calculation, and painting pixels to screen.",
    },
  ],

  backend: [
    {
      question: "Why is Node.js considered single-threaded yet capable of handling thousands of concurrent I/O operations?",
      options: ["It executes code on GPUs", "It uses an event-driven, non-blocking I/O model delegating asynchronous tasks to libuv's thread pool and kernel epoll/kqueue", "It creates a separate operating system process for every HTTP request", "It executes only synchronous code"],
      correctIndex: 1,
      explanation: "Node.js runs JavaScript on a single main event loop thread while offloading asynchronous I/O operations to libuv and operating system kernel primitives.",
    },
    {
      question: "What is the difference between horizontal and vertical database scaling?",
      options: ["Horizontal adds more compute resources (CPU/RAM) to a single machine; Vertical adds more machines to a cluster", "Vertical increases hardware capacity of a single server; Horizontal partitions data across multiple distributed nodes", "There is no difference in distributed systems", "Vertical scaling is only used for caching"],
      correctIndex: 1,
      explanation: "Vertical scaling (scaling up) upgrades existing hardware, whereas horizontal scaling (scaling out) distributes workloads and data across multiple cooperating instances.",
    },
    {
      question: "What HTTP status code indicates a client request was well-formed but was rejected due to business logic constraint violations (e.g. duplicate key or insufficient funds)?",
      options: ["200 OK", "404 Not Found", "422 Unprocessable Entity or 400 Bad Request", "502 Bad Gateway"],
      correctIndex: 2,
      explanation: "HTTP 422 (Unprocessable Entity) or 400 (Bad Request) communicates semantic or validation errors in a client-supplied payload.",
    },
    {
      question: "In distributed microservices, what problem does the Circuit Breaker pattern solve?",
      options: ["Preventing cascading system failures by failing fast when a downstream dependency is degraded or unavailable", "Formatting JSON payloads", "Generating TLS certificates", "Routing frontend assets"],
      correctIndex: 0,
      explanation: "A circuit breaker monitors calls to external services; when failure rates exceed a threshold, it trips to prevent resource starvation and cascading crashes.",
    },
    {
      question: "What is the primary benefit of Redis in a high-throughput backend architecture?",
      options: ["Relational 3NF table joins", "In-memory data store providing sub-millisecond read/write latency for caching and session management", "Replacing all hard drives with magnetic tape", "Parsing HTML templates"],
      correctIndex: 1,
      explanation: "Redis stores data in RAM, delivering rapid data access for caching, rate limiting, and pub/sub message brokering.",
    },
  ],

  docker: [
    {
      question: "What is the fundamental difference between a Docker container and a traditional Virtual Machine (VM)?",
      options: ["Containers run their own complete guest operating systems and hypervisors", "Containers share the host OS kernel and isolate user space using Linux cgroups and namespaces, resulting in minimal overhead", "VMs do not use CPU resources", "Containers can only run on Windows"],
      correctIndex: 1,
      explanation: "Containers share the host kernel while using namespaces (isolation) and cgroups (resource limits), making them orders of magnitude lighter than hypervisor-managed VMs.",
    },
    {
      question: "What is the advantage of multi-stage builds in a Dockerfile?",
      options: ["Compiling multiple programming languages in parallel", "Separating the build/compilation environment from the minimal runtime image to dramatically reduce image size and attack surface", "Running multiple containers inside a single image", "Bypassing container registries"],
      correctIndex: 1,
      explanation: "Multi-stage builds permit heavy compilers/SDKs in early stages, copying only compiled binaries into lean, secure final production images (e.g. Alpine/distroless).",
    },
    {
      question: "In Docker networking, what is the default network driver assigned to standalone containers?",
      options: ["host", "bridge", "overlay", "macvlan"],
      correctIndex: 1,
      explanation: "The default `bridge` driver creates a software bridge on the host (docker0), allowing isolated containers on the same host to communicate via IP.",
    },
    {
      question: "What is the purpose of a Kubernetes Pod?",
      options: ["A hardware blade in a server rack", "The smallest deployable computing unit in Kubernetes, encapsulating one or more tightly coupled containers sharing storage and network namespaces", "A Docker registry mirror", "A load testing script"],
      correctIndex: 1,
      explanation: "A Pod represents a single instance of a running process in a cluster, co-locating tightly coupled containers that share an IP address and localhost network.",
    },
    {
      question: "Why should production containers avoid running processes as the root user?",
      options: ["Root processes consume 2x more memory", "If a container breakout vulnerability occurs, the attacker immediately gains root execution privileges on the host operating system", "Docker daemon crashes when non-root users are absent", "Root processes cannot bind to port 8080"],
      correctIndex: 1,
      explanation: "Running as non-root mitigates container escape vulnerabilities, preventing compromised containerized processes from wielding root capabilities on the host kernel.",
    },
  ],

  testing: [
    {
      question: "In the Test Pyramid model, which tier should comprise the largest volume of tests?",
      options: ["End-to-End (E2E) Browser Tests", "Manual Exploratory Tests", "Fast, isolated Unit Tests", "Staging Performance Tests"],
      correctIndex: 2,
      explanation: "Unit tests are fast, inexpensive, and highly reliable, forming the broad foundational base of the standard Test Pyramid.",
    },
    {
      question: "What is the core distinction between a 'Stub' and a 'Mock' in automated testing?",
      options: ["Stubs test UI colors; Mocks test databases", "A Stub provides pre-canned answers to calls, whereas a Mock also verifies behavioral expectations (e.g. verifying that a method was invoked with specific arguments)", "Stubs are written in Python; Mocks in JavaScript", "Mocks cannot return values"],
      correctIndex: 1,
      explanation: "Stubs hold state and return canned responses; Mocks verify behavioral interactions by asserting that expected method invocations occurred.",
    },
    {
      question: "What is Regression Testing in software quality engineering?",
      options: ["Testing a system exclusively before any code is written", "Re-running existing test suites to confirm that new code changes, bug fixes, or enhancements have not broken previously working functionality", "Testing legacy hardware performance", "Measuring code typing speed"],
      correctIndex: 1,
      explanation: "Regression testing ensures that enhancements or fixes have not unintentionally regressed or broken established system behaviors.",
    },
    {
      question: "What is Mutation Testing in software testing?",
      options: ["Testing genetic algorithms", "Intentionally injecting small faults (mutants) into source code to evaluate whether existing test suites detect and fail on the defects", "Rewriting test code in TypeScript", "Testing with random mouse clicks"],
      correctIndex: 1,
      explanation: "Mutation testing measures test suite quality: if tests still pass after code logic is modified (a mutant survives), the test suite has coverage blind spots.",
    },
    {
      question: "What does Code Coverage (e.g. Statement or Branch Coverage) demonstrate?",
      options: ["That software contains zero bugs", "The percentage of lines or decision branches executed by the test suite, serving as a measure of untested code rather than correctness", "The speed of the continuous integration server", "The number of users testing the application"],
      correctIndex: 1,
      explanation: "Coverage metrics highlight untested execution paths; high coverage is necessary but does not guarantee the absence of logical defects.",
    },
  ],

  javascript: [
    {
      question: "What is a Closure in JavaScript?",
      options: ["A syntax error that closes the application", "The combination of a function bundled together with references to its surrounding lexical state (lexical environment)", "A method for terminating worker threads", "An encrypted script block"],
      correctIndex: 1,
      explanation: "A closure gives a function access to its outer scope from an inner function, persisting access to enclosing variables even after the outer function has returned.",
    },
    {
      question: "How does the JavaScript Event Loop coordinate execution between the Microtask Queue and the Macrotask (Callback) Queue?",
      options: ["Macrotasks execute before every microtask", "All queued microtasks (e.g. Promise callbacks, queueMicrotask) are drained completely before the event loop picks the next macrotask (e.g. setTimeout, setInterval)", "Microtasks are run in parallel on background worker threads", "Both queues execute in alphabetical order"],
      correctIndex: 1,
      explanation: "The event loop processes microtasks immediately after the current execution context and drains the entire microtask queue before picking the next macrotask.",
    },
    {
      question: "What is the difference between `==` and `===` in JavaScript?",
      options: ["`===` compares values after performing implicit type coercion", "`===` (strict equality) compares both value and type without performing type coercion, while `==` coerces types prior to comparison", "`==` is deprecated in ES6", "`===` only works for numbers"],
      correctIndex: 1,
      explanation: "Strict equality (`===`) requires both operands to share the same type and value without performing implicit type conversions.",
    },
    {
      question: "What does `Promise.allSettled()` do compared to `Promise.all()`?",
      options: ["It rejects immediately if any promise fails", "`Promise.allSettled()` waits for all input promises to either resolve or reject, returning an array of outcome objects, whereas `Promise.all()` short-circuits on the first rejection", "It cancels pending HTTP requests", "It converts promises into synchronous callbacks"],
      correctIndex: 1,
      explanation: "`Promise.allSettled()` guarantees all asynchronous tasks finish regardless of errors, whereas `Promise.all()` fails fast on any rejected promise.",
    },
    {
      question: "What is Prototype Chaining in JavaScript inheritance?",
      options: ["A blockchain consensus algorithm in Node.js", "The mechanism where an object delegates property lookups up its prototype link until found or reaching null", "A build pipeline bundling files", "A circular reference error"],
      correctIndex: 1,
      explanation: "Objects inherit properties via an internal prototype reference; if a property is not on the instance, the engine traverses the prototype chain up to `Object.prototype`.",
    },
  ],

  python: [
    {
      question: "What is the Global Interpreter Lock (GIL) in CPython?",
      options: ["A security module encrypting Python source code", "A mutex that allows only one native thread to execute Python bytecode at a time, preventing multi-core concurrency in CPU-bound Python threads", "A database locking mechanism in Django", "A file system permission flag"],
      correctIndex: 1,
      explanation: "The GIL protects CPython memory management and reference counts, ensuring only one thread executes Python bytecode concurrently within a single process.",
    },
    {
      question: "What is the difference between a Python Generator and a standard List?",
      options: ["Generators store all values in memory upfront", "Generators produce items on demand using `yield` and maintain minimal memory footprint, whereas lists store all elements in RAM simultaneously", "Generators cannot be iterated with `for` loops", "Lists are immutable, generators are mutable"],
      correctIndex: 1,
      explanation: "Generators utilize lazy evaluation to yield values one at a time, enabling processing of massive or infinite sequences without memory exhaustion.",
    },
    {
      question: "What does the `@property` decorator accomplish in Python classes?",
      options: ["Encrypts class instance fields", "Allows a method to be accessed as a getter attribute while maintaining custom access logic and encapsulation", "Exports the class to a JSON string", "Prevents class inheritance"],
      correctIndex: 1,
      explanation: "`@property` enables Pythonic attribute access syntax while delegating getters, setters, and validation methods under the hood.",
    },
    {
      question: "What is the output behavior of mutable default arguments in Python function definitions (e.g. `def append_item(x, items=[])`)?",
      options: ["A fresh empty list is created on every function call", "The default list is instantiated once when the function is defined, causing state mutations to persist across subsequent invocations", "Python raises a syntax error", "The list is automatically garbage collected after return"],
      correctIndex: 1,
      explanation: "Default arguments are evaluated once at function definition time; mutating a default mutable container affects all future calls omitting that parameter.",
    },
    {
      question: "What is the time complexity of looking up a key in a standard Python dictionary (`dict`) on average?",
      options: ["O(N)", "O(log N)", "O(1)", "O(N^2)"],
      correctIndex: 2,
      explanation: "Python dictionaries are implemented as high-performance hash tables, providing amortized O(1) constant time complexity for key lookups.",
    },
  ],

  sql: [
    {
      question: "What do the ACID properties represent in relational database transaction management?",
      options: ["Access, Control, Integrity, Distribution", "Atomicity, Consistency, Isolation, Durability", "Authentication, Cryptography, Identity, Directory", "Asynchronous, Concurrent, Indexed, Distributed"],
      correctIndex: 1,
      explanation: "ACID guarantees that database transactions are processed reliably: Atomic (all-or-nothing), Consistent, Isolated from others, and Durable against crashes.",
    },
    {
      question: "Why does adding a B-Tree index to a database column accelerate SELECT queries while slightly slowing INSERT and UPDATE operations?",
      options: ["Indices compress database backups", "The index maintains a sorted tree allowing O(log N) lookup speeds, but every insert or update requires updating both the table and the index tree structure", "Indices convert SQL to C++ machine code", "Indices lock the entire database during reads"],
      correctIndex: 1,
      explanation: "B-Tree indexes drastically reduce search disk I/O, but every write operation incurs the write overhead of updating the auxiliary index tree.",
    },
    {
      question: "What is the key difference between an INNER JOIN and a LEFT JOIN in SQL?",
      options: ["INNER JOIN returns only rows with matching keys in both tables; LEFT JOIN returns all rows from the left table and matched rows from the right table (with NULLs for unmatched rows)", "LEFT JOIN only works on numeric primary keys", "INNER JOIN deletes unmatched records", "There is no difference in modern RDBMS"],
      correctIndex: 0,
      explanation: "INNER JOIN yields the intersection of both tables; LEFT JOIN preserves all records from the left table regardless of right-table matches.",
    },
    {
      question: "What is the purpose of Database Normalization (e.g., 3NF)?",
      options: ["Maximizing data duplication for faster reads", "Minimizing data redundancy and avoiding insert, update, and deletion anomalies", "Encrypting database disk volumes", "Enabling multi-master replication"],
      correctIndex: 1,
      explanation: "Normalization organizes table structures to eliminate redundant data and ensure dependencies make logical sense, preventing anomalies.",
    },
    {
      question: "What transaction isolation level prevents 'Dirty Reads' but still permits 'Non-Repeatable Reads'?",
      options: ["Read Uncommitted", "Read Committed", "Repeatable Read", "Serializable"],
      correctIndex: 1,
      explanation: "Read Committed prevents a transaction from reading uncommitted changes made by concurrent transactions, but values may change if re-read after another transaction commits.",
    },
  ],
};
