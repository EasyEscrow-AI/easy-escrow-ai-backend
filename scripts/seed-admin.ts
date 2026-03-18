import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const BCRYPT_ROUNDS = 12;

async function seedAdmin() {
  const prisma = new PrismaClient();

  try {
    const email = process.env.ADMIN_EMAIL || 'admin@amina.bank';
    const name = 'AMINA Admin';

    // Use env var password, or generate a secure random one
    let password = process.env.ADMIN_PASSWORD;
    let generatedPassword = false;

    if (!password) {
      password = crypto.randomBytes(24).toString('base64url');
      generatedPassword = true;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const admin = await prisma.adminUser.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      update: {
        // Don't overwrite password on re-run (admin may have changed it)
        name,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });

    console.log(`✅ Admin user seeded: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Active: ${admin.isActive}`);

    if (generatedPassword) {
      console.log(`\n🔑 Generated password (save this — it will not be shown again):`);
      console.log(`   ${password}\n`);
    }
  } catch (error) {
    console.error('❌ Failed to seed admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();
