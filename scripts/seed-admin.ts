import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

async function seedAdmin() {
  const prisma = new PrismaClient();

  try {
    const email = 'admin@amina.bank';
    const password = 'AminaAdmin2024!';
    const name = 'AMINA Admin';

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

    console.log(`✅ Admin user seeded: ${admin.email} (${admin.id})`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Active: ${admin.isActive}`);
  } catch (error) {
    console.error('❌ Failed to seed admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();
