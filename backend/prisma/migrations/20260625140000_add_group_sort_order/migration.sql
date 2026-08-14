-- AlterTable: 部署の表示順（同じ親の中での並び順。既存行は0=従来どおり作成順で表示）
ALTER TABLE "Group" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
