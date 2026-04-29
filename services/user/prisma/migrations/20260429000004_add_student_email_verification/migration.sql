-- Add student email verification fields to users table
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "studentEmailVerified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "studentEmailVerifiedAt" TIMESTAMP(3);

-- Create student_email_verifications table
CREATE TABLE IF NOT EXISTS "student_email_verifications" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "codeHash"  TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_email_verifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_email_verifications_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
