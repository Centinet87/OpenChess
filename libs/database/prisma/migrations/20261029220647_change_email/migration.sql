-- AlterEnum
ALTER TYPE "email_token_purpose" ADD VALUE 'CHANGE_EMAIL';

-- AlterTable
ALTER TABLE "email_tokens" ADD COLUMN     "new_email" TEXT;
