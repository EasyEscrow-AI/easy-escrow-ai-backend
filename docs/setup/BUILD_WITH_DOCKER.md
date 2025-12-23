# Building Solana Programs with Docker

**Purpose:** Build cNFT-enabled Solana program on Windows without WSL

---

## Prerequisites

**Docker Desktop:**
- ✅ Installed (detected: Docker 28.4.0)
- ⚠️ Must be running before building

**To start Docker Desktop:**
1. Search for "Docker Desktop" in Windows Start menu
2. Launch the application
3. Wait for Docker engine to start (~30 seconds)
4. Verify with: `docker ps` (should show empty list, not error)

---

## Quick Start

**1. Start Docker Desktop**
```powershell
# Launch Docker Desktop from Start menu
# Wait for "Docker Desktop is running" in system tray
```

**2. Build the program**
```powershell
# From project root
.\scripts\build-docker.ps1
```

**3. Deploy to staging**
```powershell
# Copy built program to deploy directory
Copy-Item target\docker-deploy\easyescrow.so target\deploy\

# Deploy
solana config set --url devnet
anchor deploy
```

---

## Build Process Details

### What Happens During Build

**Step 1: Build Docker Image (10-15 minutes first time, cached afterward)**
- Downloads Rust 1.79 base image
- Installs Solana CLI 1.18.26
- Verifies installations

**Step 2: Build Program (5-10 minutes)**
- Copies Rust source code into container
- Runs `cargo build-sbf` in Linux environment
- Outputs `.so` file to `target/docker-deploy/`

**Total Time:**
- First build: ~20-25 minutes
- Subsequent builds: ~5-10 minutes (Docker layers cached)

---

## Build Output

**Location:** `target/docker-deploy/`

**Files:**
- `easyescrow.so` - Compiled program binary (deploy this)
- `easyescrow-keypair.json` - Program keypair (usually not needed)

---

## Configuration

**Default versions** (in `scripts/build-docker.ps1`):
- Rust: 1.79
- Solana CLI: v1.18.26
- Anchor: 0.29.0

**To override:**
```powershell
.\scripts\build-docker.ps1 `
    -RustVersion "1.78" `
    -SolanaVersion "v1.18.20" `
    -AnchorVersion "0.28.0"
```

---

## Troubleshooting

### Error: "Cannot connect to Docker daemon"

**Problem:** Docker Desktop isn't running

**Solution:**
1. Launch Docker Desktop from Start menu
2. Wait for system tray icon to say "Docker Desktop is running"
3. Verify: `docker ps` (should work)

### Error: "Failed to pull rust image"

**Problem:** Network/firewall blocking Docker Hub

**Solution:**
1. Check internet connection
2. Check firewall settings
3. Try: `docker pull rust:1.79` manually

### Error: "No space left on device"

**Problem:** Docker storage full

**Solution:**
1. Clean up: `docker system prune -a`
2. In Docker Desktop: Settings → Resources → increase disk space

### Build takes too long (>30 minutes)

**Problem:** Not using cached layers

**Solution:**
1. Don't modify Dockerfile between builds
2. Check Docker Desktop settings → Resources → increase CPU/RAM

### Permission denied on output files

**Problem:** Docker volume mount permissions

**Solution:**
1. Run PowerShell as Administrator
2. Or: manually copy files from container

---

## Comparison: Docker vs WSL

| Factor | Docker | WSL |
|--------|--------|-----|
| **Build Speed** | ⚡⚡ Medium (5-10 min) | ⚡⚡⚡ Fast (2-3 min) |
| **Setup Time** | 🟡 30 min first time | 🟡 45 min one-time |
| **Storage** | 📦 ~5-10 GB | 📦 ~1-2 GB |
| **Use Case** | ✅ Verifiable builds | ✅ Daily development |

**Recommendation:**
- Use Docker for staging/production deployments
- Consider WSL for rapid local iteration (if building frequently)

---

## Files Created

```
project-root/
├── Dockerfile.solana-build          # Docker build configuration
├── scripts/
│   └── build-docker.ps1              # PowerShell build script
└── target/
    └── docker-deploy/                # Build output directory
        ├── easyescrow.so             # ← Deploy this file
        └── easyescrow-keypair.json
```

---

## Next Steps After Build

**1. Verify build output:**
```powershell
ls target\docker-deploy\easyescrow.so
# Should show file size ~300-400 KB
```

**2. Copy to deploy directory:**
```powershell
Copy-Item target\docker-deploy\easyescrow.so target\deploy\
```

**3. Deploy to staging (devnet):**
```powershell
# Configure Solana CLI
solana config set --url devnet
solana config set --keypair wallets/staging/staging-deployer.json

# Deploy program
anchor deploy
# OR
solana program deploy target/deploy/easyescrow.so `
    --program-id AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei `
    --keypair wallets/staging/staging-deployer.json
```

**4. Verify deployment:**
```powershell
solana program show AvdX6LEkoAmP961QwNjAUNpiuDtiQjaiSw5wR5zb9Zei --url devnet
```

**5. Test cNFT swaps:**
```powershell
# Run E2E tests against deployed program
npm run test:staging:e2e:atomic:cnft-for-sol
```

---

## FAQ

**Q: Why not use `anchor build`?**  
A: `anchor build` fails on Windows due to mpl-bubblegum build scripts. Docker provides Linux environment.

**Q: Is this slower than native builds?**  
A: Slightly (2-3x), but only for initial image build. Subsequent builds are fast due to caching.

**Q: Can I use this for mainnet?**  
A: Yes! This creates verifiable builds suitable for mainnet deployment.

**Q: Do I need to rebuild the Docker image every time?**  
A: No. Image is cached. You only rebuild if you change Rust/Solana/Anchor versions.

**Q: What if I change program code?**  
A: Just run `.\scripts\build-docker.ps1` again. Only the program compilation step runs (~5 min).

---

## Support

**Docker Issues:**
- Docker Desktop docs: https://docs.docker.com/desktop/
- Docker Hub: https://hub.docker.com/

**Solana Build Issues:**
- Solana docs: https://docs.solana.com/
- Anchor docs: https://www.anchor-lang.com/

**This Project:**
- See: `docs/tasks/CNFT_WINDOWS_BUILD_SOLUTIONS.md`
- See: `docs/tasks/CNFT_RUST_COMPILATION_RESOLUTION.md`

