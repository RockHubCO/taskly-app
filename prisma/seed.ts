import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const connectionString = `${process.env.DATABASE_URL}`

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seeding...')
  
  // 1. Create a default admin/test user
  const adminEmail = 'admin@taskly.com'
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail }
  })

  let user
  
  if (!existingUser) {
    const hashedPassword = await bcrypt.hash('taskly123', 10)
    user = await prisma.user.create({
      data: {
        name: 'Taskly Admin',
        email: adminEmail,
        passwordHash: hashedPassword,
        role: 'ADMIN',
      }
    })
    console.log(`✅ Created test user: ${user.email}`)
  } else {
    user = existingUser
    console.log(`ℹ️ Test user already exists: ${user.email}`)
  }

  // 2. Create an initial conversation template if doesn't exist
  const existingConversation = await prisma.conversation.findFirst({
    where: { userId: user.id }
  })
  
  if (!existingConversation) {
    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        title: 'Bem-vindo ao Taskly Assistant',
        messages: {
          create: {
            role: 'ASSISTANT',
            content: 'Olá! Sou seu assistente de produtividade. Pelo que posso ajudar hoje? Você pode pedir para eu criar tarefas, gerenciar projetos, etc.',
          }
        }
      }
    })
    console.log(`✅ Created initial conversation ID: ${conversation.id}`)
  } else {
     console.log(`ℹ️ User already has conversations.`)
  }

  console.log('✅ Seeding finished successfully.')
}

main()
  .catch((e) => {
    console.error('❌ Error during database seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
