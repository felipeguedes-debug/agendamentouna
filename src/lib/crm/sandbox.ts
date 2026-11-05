import { isUuid, prisma } from "@/lib/db";
import { phoneVariants } from "@/lib/patients/phone";
import { CrmError, type CrmContact, type CrmContactRef, type CrmSync } from "./provider";
import { sameTag } from "./rules";

/**
 * The fake CRM of PRD 12 ("Sandbox dos provedores"): contacts, notes and the webhook
 * subscription live in the SandboxCrm tables, so the integration runs end to end
 * without a FlwChat token. A fake account is the key taken from the token, so two
 * practices with the same token share it (D-73); the tables belong to no practice and
 * are read through the base client, as the fake Google (D-58). Not available in
 * production (./index.ts).
 */

export const SANDBOX_TOKEN_PREFIX = "sandbox-";

export const sandboxCompanyId = (accountKey: string) => `sandbox-${accountKey}`;

type ContactRow = { id: string; name: string | null; phone: string | null; tagNames: string[] };

/** As the real API: on a contact, tag names come in capitals (D-70). */
const toContact = (row: ContactRow): CrmContact => ({ id: row.id, name: row.name, phone: row.phone, tags: row.tagNames.map((tag) => tag.toUpperCase()) });

export class SandboxCrmProvider implements CrmSync {
  constructor(private readonly accountKey: string) {}

  private async row(contactId: string) {
    return isUuid(contactId) ? prisma.sandboxCrmContact.findFirst({ where: { id: contactId, accountKey: this.accountKey } }) : null;
  }

  private async existing(contactId: string) {
    const row = await this.row(contactId);
    if (!row) throw new CrmError("not_found", "No such contact in the sandbox");
    return row;
  }

  async ensureTags() {}

  async companyId() {
    return sandboxCompanyId(this.accountKey);
  }

  async subscribeWebhook(url: string) {
    const subscription = await prisma.sandboxCrmSubscription.create({ data: { accountKey: this.accountKey, url, events: ["CONTACT_TAG_UPDATE"] } });
    return { subscriptionId: subscription.id, companyId: sandboxCompanyId(this.accountKey) };
  }

  async unsubscribeWebhook(subscriptionId: string) {
    if (isUuid(subscriptionId)) await prisma.sandboxCrmSubscription.deleteMany({ where: { id: subscriptionId, accountKey: this.accountKey } });
  }

  async getContact(contactId: string) {
    const row = await this.row(contactId);
    return row ? toContact(row) : null;
  }

  async findContactByPhone(phone: string) {
    const row = await prisma.sandboxCrmContact.findFirst({ where: { accountKey: this.accountKey, phone: { in: phoneVariants(phone) } } });
    return row ? toContact(row) : null;
  }

  async createContact(input: { name: string; phone: string }) {
    const found = await this.findContactByPhone(input.phone);
    if (found) return found;
    return toContact(await prisma.sandboxCrmContact.create({ data: { accountKey: this.accountKey, name: input.name, phone: input.phone } }));
  }

  async updateContactPhone(contactId: string, phone: string) {
    await this.existing(contactId);
    return toContact(await prisma.sandboxCrmContact.update({ where: { id: contactId }, data: { phone } }));
  }

  async updateTags(contact: CrmContactRef, change: { add: readonly string[]; remove: readonly string[] }) {
    const row = await this.existing(contact.id);
    // As the real API, names match whatever the case.
    const kept = row.tagNames.filter((tag) => !change.remove.some((name) => sameTag(tag, name)));
    const tagNames = [...kept, ...change.add.filter((name) => !kept.some((tag) => sameTag(tag, name)))];
    await prisma.sandboxCrmContact.update({ where: { id: contact.id }, data: { tagNames } });
  }

  async addNote(contact: CrmContactRef, text: string, options: { channelNumber: string | null }) {
    const row = await this.existing(contact.id);
    if (!row.hasConversation) return null;
    if (options.channelNumber && row.conversationNumbers.length > 0 && !row.conversationNumbers.includes(options.channelNumber)) return null;
    const note = await prisma.sandboxCrmNote.create({ data: { contactId: row.id, channelNumber: options.channelNumber, text } });
    return { noteId: note.id };
  }

  async deleteNote(noteId: string) {
    if (isUuid(noteId)) await prisma.sandboxCrmNote.deleteMany({ where: { id: noteId, contact: { is: { accountKey: this.accountKey } } } });
  }
}

/** A contact the fake CRM already has, as WhatsApp or a person made it. */
export async function putSandboxContact(accountKey: string, input: { name: string; phone: string; tags?: string[]; hasConversation?: boolean; conversationNumbers?: string[] }) {
  return prisma.sandboxCrmContact.create({
    data: { accountKey, name: input.name, phone: input.phone, tagNames: input.tags ?? [], hasConversation: input.hasConversation ?? true, conversationNumbers: input.conversationNumbers ?? [] },
  });
}

/** The secretary applies a tag in the fake CRM. */
export async function applySandboxTag(accountKey: string, contactId: string, tag: string) {
  await new SandboxCrmProvider(accountKey).updateTags({ id: contactId, phone: null }, { add: [tag], remove: [] });
}

/** Someone replaces the contact's tags in the fake CRM. */
export async function setSandboxTags(accountKey: string, contactId: string, tags: string[]) {
  await prisma.sandboxCrmContact.update({ where: { id: contactId, accountKey }, data: { tagNames: tags } });
}

/** The body FlwChat posts when a contact's tags change, in the shape of the documentation (docs/flwchat.md). */
export async function sandboxWebhookBody(accountKey: string, contactId: string) {
  const row = await prisma.sandboxCrmContact.findFirstOrThrow({ where: { id: contactId, accountKey } });
  return {
    eventType: "CONTACT_TAG_UPDATE",
    date: new Date().toISOString(),
    content: {
      id: row.id,
      companyId: sandboxCompanyId(accountKey),
      name: row.name,
      phonenumber: row.phone ? row.phone.replace(/^\+(\d{2})/, "+$1|") : null,
      tagsId: [],
      tags: row.tagNames.map((tag) => tag.toUpperCase()),
      status: "ACTIVE",
    },
  };
}
