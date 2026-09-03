# Security Specification: Firestore Production Rules

This specification establishes the data invariants, vulnerability tests, and security boundaries for the Firestore production rules, with special enforcement designating `gcp@aromaorganic.in` as the only administrator with full root-level access.

## 1. Data Invariants

1. **Root Administrator Supremacy**: The identity `gcp@aromaorganic.in` is the only user with `Role.Admin` who bypassing standard constraints and possesses full read/write/delete access across all collections.
2. **User Identity Integrity**: Users can only create or update their own user document under `/users/{email}` where `{email}` must match their lowercased authenticated Google account email.
3. **Immutable Auditing**: Audit logs written to `/logs/{logId}` and email sent logs to `/email_sent_logs/{logId}` are strictly write-once. Updates and deletions are forbidden except by the designated admin.
4. **Role & Access Protection**: Non-admins are strictly blocked from changing their own `role` or `accessLevel` inside `/users/{email}`.
5. **ID Integrity & Validation**: Document IDs must conform to alphanumeric/hyphen formats and satisfy maximum length constraints to prevent Denial-of-Wallet (DoW) character bloat attacks.
6. **Integrity of System Settings**: Critical global configurations in `/settings/{docId}` cannot be edited or deleted by standard (non-admin) users.
7. **Strict Timestamps**: Standard write operations must utilize actual server times for fields like `createdAt` and `updatedAt`.
8. **Relational Validity**: Documents created under linked collections (like `/leads`, `/tasks`, `/orders`) must contain valid creator and assignee identifiers.

---

## 2. The "Dirty Dozen" Malicious Payloads

The following 12 payloads represent attacks trying to bypass rules of Identity, Integrity, and State. All must fail with `PERMISSION_DENIED` under production rules.

### Payload 1: Privilege Escalation (Self-Assigned Admin Role)
* **Target Collection**: `/users/attacker@domain.com`
* **Vulnerability Goal**: An attacker registers or updates their own profile to acquire `Role.Admin` or `AccessLevel.Manager`.
```json
{
  "id": "attacker@domain.com",
  "name": "Attacker",
  "email": "attacker@domain.com",
  "role": "Admin",
  "accessLevel": "Manager",
  "teamName": "Executive"
}
```

### Payload 2: Profile Hijacking (Writing to Another User's Document)
* **Target Collection**: `/users/victim@domain.com`
* **Vulnerability Goal**: An authenticated attacker tries to overwrite or modify a victim's user profile details.
```json
{
  "id": "victim@domain.com",
  "name": "Victim (Hacked)",
  "email": "victim@domain.com",
  "teamName": "SME West Coast"
}
```

### Payload 3: Log Tampering (Modifying Action Audits)
* **Target Collection**: `/logs/log_123`
* **Vulnerability Goal**: An attacker attempts to cover their tracks by editing a pre-existing audit log document.
```json
{
  "id": "log_123",
  "actionType": "Delete Order",
  "details": "Fake logs inserted to cover track",
  "timestamp": "2026-09-03T05:53:24Z"
}
```

### Payload 4: Setting Poisoning (Disabling Security Audits)
* **Target Collection**: `/settings/auditLogStatus`
* **Vulnerability Goal**: A non-admin user attempts to disable the auditing system entirely.
```json
{
  "enabled": false
}
```

### Payload 5: Lead Injection (Spoofing Creator Identity)
* **Target Collection**: `/leads/lead_456`
* **Vulnerability Goal**: A user attempts to create a lead under another user's ID as the creator.
```json
{
  "id": "lead_456",
  "clientName": "Test Client",
  "createdByUserId": "victim_user@domain.com",
  "assignedToUserId": "victim_user@domain.com"
}
```

### Payload 6: ID Poisoning (Resource Bloating DoW Attack)
* **Target Collection**: `/leads/SUPER_LONG_INVALID_ID_WITH_SPECIAL_CHARS_$$$___`
* **Vulnerability Goal**: Attempting to insert an extremely bloated, junk string as a document key to trigger excessive index and search consumption.
```json
{
  "id": "SUPER_LONG_INVALID_ID_WITH_SPECIAL_CHARS_$$$___",
  "clientName": "Bloated ID"
}
```

### Payload 7: Client Record Tampering (Unauthorized Deletion)
* **Target Collection**: `/clients/client_abc`
* **Vulnerability Goal**: A standard contributor user attempts to delete a core customer client record.
```json
{
  "id": "client_abc"
}
```

### Payload 8: Order Status Bypass (Artificially Locking to Closed Won)
* **Target Collection**: `/orders/order_789`
* **Vulnerability Goal**: A sales representative tries to forcefully set an order to "Closed Won" directly without filling the required sub-details or without approval.
```json
{
  "id": "order_789",
  "status": "Closed Won",
  "grandTotalOrderAmount": 100000
}
```

### Payload 9: Fake Email Quota Resets
* **Target Collection**: `/email_daily_counts/2026-09-03`
* **Vulnerability Goal**: An attacker attempts to reset the daily sent email tracking counter to zero to bypass mailing safeguards.
```json
{
  "create_order": 0,
  "invoice_issuance": 0
}
```

### Payload 10: Modifying FAQ Content (Knowledge Hijacking)
* **Target Collection**: `/faqs/faq_xyz`
* **Vulnerability Goal**: A standard user attempts to delete or rewrite the public help documentation or FAQ content.
```json
{
  "id": "faq_xyz",
  "question": "What is AOL?",
  "answer": "Defaced by attacker!"
}
```

### Payload 11: System-Only Email Log Spoofing
* **Target Collection**: `/email_sent_logs/log_999`
* **Vulnerability Goal**: Forcefully inserting fake delivery reports or deleting existing sent logs.
```json
{
  "id": "log_999",
  "to": "hacker@evil.com",
  "status": "Sent",
  "subject": "Phishing Subject"
}
```

### Payload 12: Bad Debtor Deletion (Financial Records Concealment)
* **Target Collection**: `/bad_debtors/debtor_777`
* **Vulnerability Goal**: A standard user or rogue sales agent attempts to delete a bad debtor default record.
```json
{
  "id": "debtor_777"
}
```

---

## 3. The Test Runner

The test runner `firestore.rules.test.ts` utilizes the `@firebase/rules-unit-testing` framework. It verifies that all standard users are securely guarded, while `gcp@aromaorganic.in` successfully exercises root access.

```ts
import * as testing from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";

const PROJECT_ID = "fmsdb";

describe("Firestore Security Rules Tests", () => {
  let adminDb: any;
  let victimDb: any;
  let attackerDb: any;

  beforeAll(async () => {
    const rules = readFileSync("firestore.rules", "utf8");
    await testing.loadFirestoreRules({ projectId: PROJECT_ID, rules });
  });

  beforeEach(() => {
    adminDb = testing.initializeTestApp({
      projectId: PROJECT_ID,
      auth: { uid: "admin_uid", email: "gcp@aromaorganic.in", email_verified: true }
    }).firestore();

    victimDb = testing.initializeTestApp({
      projectId: PROJECT_ID,
      auth: { uid: "victim_uid", email: "victim@aromaorganic.in", email_verified: true }
    }).firestore();

    attackerDb = testing.initializeTestApp({
      projectId: PROJECT_ID,
      auth: { uid: "attacker_uid", email: "attacker@aromaorganic.in", email_verified: true }
    }).firestore();
  });

  afterAll(async () => {
    await Promise.all(testing.apps().map(app => app.delete()));
  });

  test("Designated Admin (gcp@aromaorganic.in) has full access everywhere", async () => {
    await testing.assertSucceeds(
      adminDb.collection("users").doc("test@test.com").set({
        id: "test@test.com",
        name: "Test User",
        role: "Admin",
        accessLevel: "Manager"
      })
    );
  });

  test("Attacker cannot write to other user profile", async () => {
    await testing.assertFails(
      attackerDb.collection("users").doc("victim@aromaorganic.in").set({
        name: "Hacked"
      })
    );
  });

  test("Attacker cannot perform privilege escalation to Admin", async () => {
    await testing.assertFails(
      attackerDb.collection("users").doc("attacker@aromaorganic.in").set({
        role: "Admin"
      })
    );
  });
});
```
