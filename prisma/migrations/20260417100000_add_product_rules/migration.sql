-- AlterTable: добавляем колонку rules для хранения правил курса/марафона в markdown
ALTER TABLE "products" ADD COLUMN "rules" TEXT;
