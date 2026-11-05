-- Accent-insensitive patient search (Block 3, D-45). The trigger keeps
-- "searchName" = lower(unaccent(name)) for every writer, including the
-- spreadsheet import of Block 4, which uses the base client.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "searchName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Patient_practiceId_searchName_idx" ON "Patient"("practiceId", "searchName");

CREATE FUNCTION patient_search_name() RETURNS trigger AS $$
BEGIN
  NEW."searchName" := lower(unaccent(NEW."name"));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_search_name
  BEFORE INSERT OR UPDATE OF "name", "searchName" ON "Patient"
  FOR EACH ROW EXECUTE FUNCTION patient_search_name();

UPDATE "Patient" SET "searchName" = lower(unaccent("name"));
