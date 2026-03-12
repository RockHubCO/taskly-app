import { authConfig } from './auth.config';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const email = 'carlos.matos@saritur.com.br';
  const password = '123'; // Wait, I reset it to 123456

  const user = await prisma.user.findUnique({
    where: { email }
  });

  console.log('User found:', !!user);
  if (user) {
    console.log('Password hash:', user.passwordHash);
    const match = await bcrypt.compare('123456', user.passwordHash!);
    console.log('Match 123456:', match);
  }
}
main();
