-- Contact consent is an append-only log (Block 4, D-47): consent and its
-- revocation are new rows, and the latest one is the current state. Patients are
-- pseudonymized, never deleted (D-28), so the log outlives an erasure.

-- DropForeignKey
ALTER TABLE "ContactConsent" DROP CONSTRAINT "ContactConsent_patientId_practiceId_fkey";

-- AddForeignKey
ALTER TABLE "ContactConsent" ADD CONSTRAINT "ContactConsent_patientId_practiceId_fkey" FOREIGN KEY ("patientId", "practiceId") REFERENCES "Patient"("id", "practiceId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION forbid_contact_consent_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ContactConsent is append-only: % is not allowed', TG_OP USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contact_consent_append_only
  BEFORE UPDATE OR DELETE ON "ContactConsent"
  FOR EACH ROW EXECUTE FUNCTION forbid_contact_consent_change();

CREATE TRIGGER contact_consent_no_truncate
  BEFORE TRUNCATE ON "ContactConsent"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_contact_consent_change();
