# cNFT Windows Build Solutions

**Research Date:** November 28, 2025  
**Issue:** mpl-bubblegum 0.7.0 build script incompatible with Windows (os error 193)  
**Research Method:** Perplexity Search API  

---

## Problem Confirmation ✅

**Verified by Community:**
- WSL is the **official recommended solution** for Windows Solana development (Anchor docs, Solana Foundation)
- The `cargo build-sbf` issue on Windows is well-documented across GitHub issues, Stack Overflow, and developer blogs
- Metaplex Bubblegum build scripts execute Unix binaries that cannot run on Win32 systems
- This affects **all** Metaplex programs with build scripts (not just Bubblegum)

---

## Solution 1: WSL (Windows Subsystem for Linux) - Recommended ⭐

### Why WSL?
- **Official Anchor Framework recommendation** for Windows developers
- Native Linux environment on Windows
- No Docker overhead
- Consistent with production build environments
- Best developer experience

### Installation Steps

**1. Install WSL**
```powershell
# Run in PowerShell as Administrator
wsl --install
```

**2. Install Ubuntu (default distribution)**
- WSL will automatically install Ubuntu
- Create a user account when prompted
- Open Ubuntu from Windows Search

**3. Set Up Solana Environment in WSL**
```bash
# Inside Ubuntu/WSL terminal

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Add Solana to PATH
echo 'export PATH="/root/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest

# Verify installations
rustc --version
solana --version
anchor --version
```

**4. Navigate to Project in WSL**
```bash
# Windows drives are accessible at /mnt/
cd /mnt/c/websites/VENTURE/easy-escrow-ai-backend/programs/escrow

# Set HOME environment variable
export HOME=$HOME

# Build program
cargo build-sbf
```

### VS Code Integration
- Install "Remote - WSL" extension in VS Code
- Open WSL terminal in VS Code: `Ctrl+Shift+P` → "WSL: New Window"
- Your Windows files are accessible at `/mnt/c/`

### Pros & Cons

✅ **Pros:**
- Official recommendation
- No containerization overhead
- Direct file system access
- Best performance
- Seamless VS Code integration
- Can use Windows Git with WSL

❌ **Cons:**
- Requires WSL installation (one-time 10-15 min setup)
- Learning curve for Linux commands (minimal)
- Slight storage overhead (~1-2 GB for Ubuntu)

---

## Solution 2: Docker Verifiable Builds - Production Grade 🐳

### Why Docker?
- **Industry standard for verifiable builds** (used by Solana programs for verification)
- Pinned dependencies ensure consistent builds
- No local environment pollution
- Same approach used for mainnet deployments
- CI/CD ready

### Dockerfile for Solana + Anchor

Create `Dockerfile.solana-build` in project root:

```dockerfile
# Verifiable Solana Build Dockerfile
# Based on: https://www.kquirapas.com/using-docker-for-verifiable-solana-builds/

# Build Image - Stage 1
ARG RUST_VERSION=1.79
FROM --platform=linux/amd64 rust:${RUST_VERSION} as builder

ARG SOLANA_CLI=v1.18.26
ARG ANCHOR_VERSION=0.29.0

# Install Solana CLI
RUN curl -sSfL "https://release.solana.com/${SOLANA_CLI}/install" | sh

# Add Solana to PATH
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Install Anchor CLI
RUN cargo install --git https://github.com/coral-xyz/anchor --tag v${ANCHOR_VERSION} anchor-cli --locked

# Verify installations
RUN rustc --version && \
    solana --version && \
    anchor --version

# Usage Image - Stage 2
FROM --platform=linux/amd64 builder

WORKDIR /workspace

# Copy only necessary files
COPY programs/escrow programs/escrow
COPY Anchor.toml .
COPY Cargo.toml .
COPY Cargo.lock .

# Set HOME for build tools
ENV HOME=/root

# Default command: build program
CMD ["sh", "-c", "cd programs/escrow && cargo build-sbf"]
```

### Build Script

Create `scripts/build-docker.sh`:

```bash
#!/bin/bash

# Docker Build Script for Solana Programs
# Ensures verifiable builds with pinned dependencies

set -e

# Configuration
RUST_VERSION=1.79
SOLANA_CLI=v1.18.26
ANCHOR_VERSION=0.29.0
IMAGE_NAME=easyescrow-builder

# Get repository root
REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# Create output directory
mkdir -p target/docker-deploy

echo "🐳 Building Docker image..."
docker build \
  --build-arg RUST_VERSION=$RUST_VERSION \
  --build-arg SOLANA_CLI=$SOLANA_CLI \
  --build-arg ANCHOR_VERSION=$ANCHOR_VERSION \
  -t $IMAGE_NAME \
  -f Dockerfile.solana-build \
  .

echo "🔨 Building Solana program in Docker..."
docker run --rm \
  --name "build-$IMAGE_NAME" \
  -v "$REPO_ROOT/target/docker-deploy:/workspace/target/deploy" \
  $IMAGE_NAME

echo "✅ Build complete! Artifacts in target/docker-deploy/"
ls -lh target/docker-deploy/*.so
```

### Usage

```bash
# Make script executable
chmod +x scripts/build-docker.sh

# Build program
./scripts/build-docker.sh

# Verify output
ls -lh target/docker-deploy/easyescrow.so
```

### Pros & Cons

✅ **Pros:**
- Industry standard for verifiable builds
- Pinned dependencies (reproducible builds)
- No local environment changes
- Works on Windows/Mac/Linux
- CI/CD ready
- Same binary as mainnet deployments

❌ **Cons:**
- Requires Docker Desktop (slower builds than WSL)
- First build takes 10-15 minutes (cached afterward)
- Slightly more complex setup
- Docker storage overhead (~5-10 GB)

---

## Solution 3: GitHub Actions - CI/CD Approach ☁️

### Why GitHub Actions?
- Already have Linux runners
- No local setup required
- Build artifacts stored on GitHub
- Automated builds on push
- Zero cost for public repos

### Workflow File

Create `.github/workflows/build-solana-program.yml`:

```yaml
name: Build Solana Program

on:
  push:
    branches: [ main, staging, develop ]
    paths:
      - 'programs/**'
      - 'Cargo.toml'
      - 'Cargo.lock'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Cache Solana CLI
      uses: actions/cache@v4
      with:
        path: |
          ~/.cache/solana
          ~/.local/share/solana
        key: solana-${{ runner.os }}-v1.18.26

    - name: Install Rust
      uses: actions-rs/toolchain@v1
      with:
        toolchain: 1.79
        override: true

    - name: Install Solana CLI
      run: |
        sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
        echo "$HOME/.local/share/solana/install/active_release/bin" >> $GITHUB_PATH

    - name: Build program
      working-directory: programs/escrow
      run: |
        export HOME=$HOME
        cargo build-sbf

    - name: Upload program artifact
      uses: actions/upload-artifact@v4
      with:
        name: solana-program
        path: target/deploy/easyescrow.so
        retention-days: 30

    - name: Upload IDL
      uses: actions/upload-artifact@v4
      with:
        name: program-idl
        path: target/idl/escrow.json
        retention-days: 30
```

### Usage

1. Push to main/staging/develop
2. GitHub Actions builds automatically
3. Download artifacts from Actions tab
4. Deploy manually or via additional workflow

### Pros & Cons

✅ **Pros:**
- Zero local setup
- Automatic builds
- Artifact storage on GitHub
- Audit trail of builds
- Free for public repos
- Works for any contributor

❌ **Cons:**
- Requires push to trigger (or manual dispatch)
- Can't iterate quickly (slower than local)
- Network latency
- Limited to 2000 minutes/month (free tier)

---

## Solution 4: Set HOME Environment Variable (Partial Fix) ⚠️

### Why This Might Help?
- Some build script failures on Windows are due to missing `HOME` environment variable
- Quick fix that sometimes resolves path issues
- **Does NOT fix mpl-bubblegum 0.7.0 build script issue**

### Steps

**PowerShell:**
```powershell
# Temporary (current session)
$env:HOME = $env:USERPROFILE

# Permanent (system-wide)
[System.Environment]::SetEnvironmentVariable("HOME", $env:USERPROFILE, "User")

# Verify
echo $env:HOME
```

**CMD:**
```cmd
set HOME=%USERPROFILE%
```

### Important Note

⚠️ **This does NOT fix mpl-bubblegum 0.7.0 build script errors.** The root issue is Unix binary execution, not environment variables. This solution is only mentioned for completeness.

---

## Solution Comparison Matrix

| Solution | Setup Time | Build Speed | Complexity | Production Ready | Cost |
|----------|-----------|-------------|-----------|------------------|------|
| **WSL** | 15 min | ⚡⚡⚡ Fast | 🟡 Medium | ✅ Yes | Free |
| **Docker** | 30 min | ⚡⚡ Medium | 🟡 Medium | ✅✅ Best | Free |
| **GitHub Actions** | 5 min | ⚡ Slow | 🟢 Easy | ✅ Yes | Free* |
| **HOME env var** | 1 min | N/A | 🟢 Easy | ❌ No | Free |

*Free tier: 2000 minutes/month

---

## Recommended Approach for This Project 🎯

**Phase 1: Quick Win (Immediate)**
- Use **GitHub Actions** for initial build
- Download artifact and test locally
- Continue backend TypeScript development (unblocked)

**Phase 2: Local Development (Within 1-2 days)**
- Set up **WSL** for ongoing development
- Best developer experience
- Fast iteration cycles

**Phase 3: Production Deployment (Ongoing)**
- Use **Docker** for verifiable mainnet deployments
- Ensures reproducible builds
- Industry best practice

---

## Implementation Timeline ⏱️

**Immediate (Today):**
1. Create GitHub Actions workflow (5 minutes)
2. Push code to trigger build
3. Download artifacts
4. Continue backend development

**Tomorrow:**
1. Install WSL (15 minutes)
2. Set up Solana environment (20 minutes)
3. Test local build
4. Document any issues

**Next Week:**
1. Create Docker setup for CI/CD
2. Test verifiable builds
3. Update deployment documentation
4. Set up mainnet deployment workflow

---

## Additional Resources 📚

### Official Documentation
- [Anchor Installation (Windows)](https://www.anchor-lang.com/docs/installation)
- [Solana CLI Installation](https://solana.com/docs/intro/installation)
- [WSL Installation Guide](https://learn.microsoft.com/en-us/windows/wsl/install)

### Community Resources
- [Verifiable Solana Builds with Docker](https://www.kquirapas.com/using-docker-for-verifiable-solana-builds/)
- [Anchor Docker Repository](https://github.com/hogyzen12/anchor-docker)
- [Solana Stack Exchange](https://solana.stackexchange.com/)

### GitHub Issues & Discussions
- [Anchor #1992: Windows Build Failures](https://github.com/solana-foundation/anchor/issues/1992)
- [Anchor #3629: Solana v2.0+ Compatibility](https://github.com/solana-foundation/anchor/issues/3629)
- [Anchor #3392: Lock File Version Issues](https://github.com/solana-foundation/anchor/issues/3392)

---

## Troubleshooting Common Issues 🔧

### Issue: WSL installation fails
**Solution:** Ensure Windows is updated to version 1903+ (Build 18362+)

### Issue: Docker build is very slow
**Solution:** Enable BuildKit: `export DOCKER_BUILDKIT=1`

### Issue: "cargo: command not found" in WSL
**Solution:** Add Cargo to PATH: `source ~/.cargo/env`

### Issue: GitHub Actions runs out of minutes
**Solution:** Self-hosted runner or Docker local builds

### Issue: Permission denied on build outputs
**Solution:** Use Docker volume mounts with user mapping

---

## Conclusion

**Recommended Solution:** WSL (Windows Subsystem for Linux)
- Official recommendation from Anchor Framework
- Best developer experience
- Fast build times
- Zero cost
- 15-minute one-time setup

**For Production Deployments:** Docker Verifiable Builds
- Industry standard
- Reproducible builds
- CI/CD ready
- Mainnet verification support

**For Quick Testing:** GitHub Actions
- No local setup
- Build once, download artifacts
- Good for unblocking development

---

**Next Steps:**
1. Choose solution based on your priorities (speed vs. long-term)
2. Follow setup instructions above
3. Build program successfully
4. Continue with Tasks 25-28 (backend TypeScript)
5. Deploy cNFT-enabled program when ready

**Estimated Resolution Time:**
- GitHub Actions: 30 minutes (including workflow creation)
- WSL Setup: 45 minutes (including Solana environment)
- Docker Setup: 60 minutes (including Dockerfile creation)

**Risk Level:** ✅ Low - All solutions are proven and well-documented by the community.

