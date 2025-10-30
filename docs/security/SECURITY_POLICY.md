# Security Policy

## 🔒 Responsible Disclosure

Easy Escrow takes the security of our smart contracts and systems seriously. We appreciate the security research community's efforts to responsibly disclose vulnerabilities and work with us to ensure the safety of our users.

## 📧 Contact Information

**Security Email:** security@easyescrow.ai

For sensitive security issues, please use our security email. We commit to:
- Acknowledging receipt within **24 hours**
- Providing an initial assessment within **72 hours**
- Keeping you informed of our progress throughout the resolution process

**Alternative Contacts:**
- GitHub Security Advisories: [Create a private security advisory](https://github.com/easy-escrow/easy-escrow-ai-backend/security/advisories/new)
- Discord: [Join our server](https://discord.gg/easyescrow) (Use for general questions only, NOT for sensitive security issues)

## 🎯 Scope

### In Scope

The following components are within the scope of our security program:

#### Solana Programs
- **Escrow Program**: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx` (Mainnet)
- **Escrow Program**: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei` (Devnet Staging)
- Program logic vulnerabilities
- PDA security issues
- Access control bypasses
- Integer overflow/underflow
- Reentrancy attacks
- Front-running vulnerabilities

#### Backend API
- Authentication and authorization flaws
- API injection vulnerabilities (SQL, NoSQL, Command)
- Cross-Site Scripting (XSS)
- Cross-Site Request Forgery (CSRF)
- Server-Side Request Forgery (SSRF)
- Insecure Direct Object References (IDOR)
- Rate limiting bypasses
- Payment/escrow logic vulnerabilities

#### Smart Contract Interactions
- Transaction replay attacks
- Signature verification bypasses
- Unauthorized fund access or theft
- Platform fee bypass mechanisms
- Price oracle manipulation

### Out of Scope

The following are **NOT** within scope:

- ❌ Denial of Service (DoS) attacks
- ❌ Social engineering attacks against employees or users
- ❌ Physical attacks against our infrastructure
- ❌ Attacks requiring physical access to user devices
- ❌ Issues in third-party services we don't control (Solana RPC nodes, blockchain explorers, etc.)
- ❌ Recently disclosed vulnerabilities (less than 30 days old) in dependencies before we've had time to patch
- ❌ Theoretical vulnerabilities without proof of exploitability
- ❌ Spam or social engineering attacks
- ❌ Issues that require unlikely user interaction
- ❌ Content injection without security impact
- ❌ Missing security best practices without direct security impact

## 🚨 Reporting a Vulnerability

### What to Include

To help us triage and respond quickly, please include:

1. **Description**: Clear description of the vulnerability
2. **Impact**: Potential impact and attack scenario
3. **Reproduction Steps**: Detailed steps to reproduce the issue
4. **Proof of Concept**: Code, screenshots, or transaction IDs demonstrating the vulnerability
5. **Environment**: Devnet/Testnet/Mainnet, program version, etc.
6. **Your Contact**: How we can reach you for follow-up questions
7. **Severity Assessment**: Your assessment of severity (Critical/High/Medium/Low)

### Severity Levels

We use the following severity classifications:

#### 🔴 Critical
- Direct theft of funds from escrow accounts
- Unauthorized minting or transfer of NFTs
- Permanent loss of user funds
- Complete bypass of authentication/authorization
- Remote code execution

#### 🟠 High  
- Unauthorized access to escrow state
- Manipulation of platform fees
- Privilege escalation
- SQL injection with data access
- Bypass of critical security controls

#### 🟡 Medium
- Information disclosure of sensitive data
- Account takeover requiring user interaction
- CSRF on state-changing operations
- Missing rate limiting on critical endpoints
- Improper input validation

#### 🟢 Low
- Information disclosure of non-sensitive data
- Open redirect
- Missing security headers
- Self-XSS
- Issues requiring significant user interaction

## ⏱️ Response Timeline

We commit to the following response timeline:

| Severity | Acknowledgment | Initial Assessment | Resolution Target |
|----------|---------------|-------------------|------------------|
| **Critical** | 24 hours | 48 hours | 7 days |
| **High** | 24 hours | 72 hours | 30 days |
| **Medium** | 48 hours | 5 days | 60 days |
| **Low** | 72 hours | 7 days | 90 days |

*Note: These are target timelines. Actual resolution may vary based on complexity.*

## 🏆 Recognition

We value the security research community and offer:

### Public Recognition
- Security researchers who responsibly disclose vulnerabilities will be acknowledged in our [Security Hall of Fame](https://easyescrow.ai/security/hall-of-fame)
- Credit will be given upon fix deployment (unless you prefer to remain anonymous)

### Bug Bounty Program
**Status:** 🔜 Coming Soon

We are currently finalizing our bug bounty program with the following planned reward tiers:

- **Critical**: $5,000 - $20,000 USD
- **High**: $1,000 - $5,000 USD
- **Medium**: $500 - $1,000 USD
- **Low**: $100 - $500 USD

**Note:** While our formal bug bounty program is in development, we may still provide discretionary rewards for exceptional vulnerability reports.

## 📋 Disclosure Process

### Our Process

1. **Receipt**: We acknowledge your report within 24-72 hours
2. **Validation**: We validate the vulnerability and assess severity
3. **Remediation**: We develop and test a fix
4. **Deployment**: We deploy the fix to production
5. **Disclosure**: We coordinate public disclosure with you (typically 90 days after fix deployment)

### Your Responsibilities

We ask that you:

- ✅ Give us reasonable time to fix the issue before public disclosure
- ✅ Make a good faith effort to avoid privacy violations, data destruction, and service disruption
- ✅ Do not exploit the vulnerability beyond what is necessary to demonstrate it
- ✅ Do not access, modify, or delete data that doesn't belong to you
- ✅ Do not perform attacks against physical security or social engineering
- ✅ Provide us with sufficient information to reproduce and fix the issue

### Safe Harbor

We commit to:

- ✅ Not pursue legal action against security researchers who follow this policy
- ✅ Work with you to understand and resolve the issue quickly
- ✅ Recognize your contribution publicly (if you wish)
- ✅ Keep you informed throughout the remediation process

## 🔐 Security Best Practices

### For Developers

Our development security practices include:

- **Code Review**: All code changes require peer review
- **Security Testing**: Automated security scanning in CI/CD
- **Dependency Management**: Regular updates and vulnerability scanning
- **Access Control**: Principle of least privilege for all systems
- **Encryption**: All sensitive data encrypted at rest and in transit
- **Audit Logs**: Comprehensive logging of all sensitive operations

### For Users

We recommend users:

- ✅ Keep wallet software up to date
- ✅ Verify transaction details before signing
- ✅ Use hardware wallets for large amounts
- ✅ Never share private keys or seed phrases
- ✅ Be cautious of phishing attempts
- ✅ Report suspicious activity immediately

## 📚 Security Resources

### Audits

- **Status**: 🔜 Scheduled for Q1 2026
- **Auditor**: TBD

Audit reports will be published at: [https://easyescrow.ai/security/audits](https://easyescrow.ai/security/audits)

### Program Verification

Our Solana programs are built with verifiable builds:

- **Tool**: [solana-verifiable-build](https://github.com/Ellipsis-Labs/solana-verifiable-build)
- **Verification**: Anyone can verify our on-chain code matches our public source code
- **Repository**: [https://github.com/easy-escrow/easy-escrow-ai-backend](https://github.com/easy-escrow/easy-escrow-ai-backend)

### Security Updates

Follow our security updates:

- **Blog**: [https://easyescrow.ai/blog/security](https://easyescrow.ai/blog/security)
- **Twitter**: [@EasyEscrow](https://twitter.com/easyescrow)
- **GitHub Security Advisories**: [Security Tab](https://github.com/easy-escrow/easy-escrow-ai-backend/security)

## 🚀 Program Versions

### Mainnet (Production)
- **Program ID**: `2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx`
- **Network**: Solana Mainnet
- **Version**: 0.1.0
- **Last Updated**: October 30, 2025

### Devnet (Staging)
- **Program ID**: `AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei`
- **Network**: Solana Devnet
- **Version**: 0.1.0
- **Last Updated**: January 20, 2025

## 📞 Emergency Contact

For **critical security issues** requiring immediate attention:

- **Email**: security@easyescrow.ai (checked 24/7)
- **Subject Line**: Use prefix `[URGENT SECURITY]` for critical issues

For critical vulnerabilities being actively exploited, we commit to:
- Response within **1 hour** during business hours
- Response within **4 hours** outside business hours
- Emergency hotfix deployment capability

## 📄 Policy Updates

This security policy may be updated from time to time. Please check back regularly for updates.

**Last Updated**: October 30, 2025  
**Version**: 1.0

---

Thank you for helping keep Easy Escrow and our users safe! 🙏

