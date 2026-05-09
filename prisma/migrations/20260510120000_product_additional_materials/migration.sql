-- CreateTable
CREATE TABLE "product_additional_materials" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "coverKey" TEXT,
    "visibilityFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_additional_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_additional_materials_productId_createdAt_idx" ON "product_additional_materials"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "product_additional_materials" ADD CONSTRAINT "product_additional_materials_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
