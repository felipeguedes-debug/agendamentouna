-- Block 9: the invitation of an organization's first admin (D-93), issued by the operator's
-- command. Accepting it also makes the person an admin of the organization.

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "organizationAdmin" BOOLEAN NOT NULL DEFAULT false;
