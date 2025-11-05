-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "smartAccountAddress" TEXT NOT NULL,
    "primaryOwnerAddress" TEXT NOT NULL,
    "loginType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "loginType" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "smartAccountAddress" TEXT NOT NULL,
    "ownerPrivateKey" TEXT NOT NULL,
    "recoveryContacts" JSONB,
    "recoveryThreshold" INTEGER,
    "passkeyEnrolled" BOOLEAN DEFAULT false,
    "sponsorshipPlan" TEXT,
    "sponsorshipTerms" TEXT,
    "paymasterPolicyId" TEXT,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeIntent" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "sourceChain" TEXT NOT NULL,
    "sourceToken" TEXT NOT NULL,
    "destinationChain" TEXT NOT NULL,
    "destinationToken" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "walletProvider" TEXT,
    "feeBps" INTEGER NOT NULL,
    "sourceUsdPrice" DECIMAL(38,18),
    "destinationUsdPrice" DECIMAL(38,18),
    "estimatedDestination" DECIMAL(38,18) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "sessionId" TEXT,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_smartAccountAddress_key" ON "Account"("smartAccountAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionId_key" ON "Session"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeIntent_intentId_key" ON "BridgeIntent"("intentId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeIntent" ADD CONSTRAINT "BridgeIntent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeIntent" ADD CONSTRAINT "BridgeIntent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

