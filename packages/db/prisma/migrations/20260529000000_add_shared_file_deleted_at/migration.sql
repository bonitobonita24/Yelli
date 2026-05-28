-- AlterTable
ALTER TABLE "shared_files" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "shared_files_deleted_at_idx" ON "shared_files"("deleted_at");
