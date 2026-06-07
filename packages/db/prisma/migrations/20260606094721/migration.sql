-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('open', 'partially_filled', 'filled', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('market', 'limit');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('buy', 'sell');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "orderId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "side" "Side" NOT NULL,
    "type" "OrderType" NOT NULL,
    "price" DECIMAL(65,30),
    "qty" DECIMAL(65,30) NOT NULL,
    "filledQty" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "margin" DECIMAL(65,30) NOT NULL,
    "Status" "OrderStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "Fill" (
    "fillId" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "buyOrderId" UUID NOT NULL,
    "sellOrderId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("fillId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_buyOrderId_fkey" FOREIGN KEY ("buyOrderId") REFERENCES "Order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_sellOrderId_fkey" FOREIGN KEY ("sellOrderId") REFERENCES "Order"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;
