-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "groupId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Publisher" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "sex" TEXT,
    "birthDate" DATETIME,
    "baptismDate" DATETIME,
    "status" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "groupId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Publisher_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publisherId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedById" TEXT,
    CONSTRAINT "StatusChange_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publisherId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "participated" BOOLEAN NOT NULL DEFAULT false,
    "bibleStudies" INTEGER NOT NULL DEFAULT 0,
    "hours" INTEGER,
    "statusAtReport" TEXT NOT NULL,
    "submittedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyReport_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_groupId_idx" ON "User"("groupId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- CreateIndex
CREATE INDEX "Publisher_groupId_idx" ON "Publisher"("groupId");

-- CreateIndex
CREATE INDEX "Publisher_status_idx" ON "Publisher"("status");

-- CreateIndex
CREATE INDEX "StatusChange_publisherId_idx" ON "StatusChange"("publisherId");

-- CreateIndex
CREATE INDEX "MonthlyReport_year_month_idx" ON "MonthlyReport"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_publisherId_year_month_key" ON "MonthlyReport"("publisherId", "year", "month");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");
