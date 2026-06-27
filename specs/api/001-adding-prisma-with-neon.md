Set up Prisma ORM in this existing NestJS TypeScript backend.

We are using PosgreSql neon


Project context:
- Package manager: pnpm
- Database: PostgreSQL
- DATABASE_URL already exists in the root .env file
- Do not overwrite, replace, print, or expose DATABASE_URL
- Do not use `prisma db push`
- Use proper Prisma migrations

## Tables

Create schemas for `users`, `accounts/wallets`, `transactions`

Create migration only using commands, do not self write it. 

Give me command to push the migrations