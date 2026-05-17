-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "default_user_id" TEXT;

-- CreateIndex
CREATE INDEX "departments_default_user_id_idx" ON "departments"("default_user_id");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_default_user_id_fkey" FOREIGN KEY ("default_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
