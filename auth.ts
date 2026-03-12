import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Missing credentials");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string }
        });

        if (!user) {
          throw new Error("User not found");
        }
        
        if (!user.passwordHash) {
          throw new Error("User has no password");
        }

        const passwordsMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordsMatch) {
          throw new Error("Invalid password");
        }

        return user;
      }
    })
  ],
});
