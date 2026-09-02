/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, Role, AccessLevel, ProjectWorkflow, SalesTask, ActionLog, TeamTabSettings, Client, Team, Product, OrderOffer, PaymentBank, ProductCategory, ProductGroup, Manufacturer, FreightTerm, DeliveryTerm, TransporterName, WarehouseManagedBy, DispatchLocation, EmailTemplate, EmailAutoSelectSettings, EmailSendingConfig, PaymentDetails, PaymentReceiptRecord, PaymentTerm, PaymentCreditPeriod, FAQItem, BugRequest, EmailLimitsConfig, EmailDailyCounts, TaxRate, BadDebtor, EmailSentLog } from "../types";
import {
  auth,
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy
} from "../firebase";
import {
  INITIAL_USERS,
  INITIAL_WORKFLOWS,
  INITIAL_PRODUCTS,
  INITIAL_ORDERS,
  INITIAL_TAX_RATES
} from "../data";

const INITIAL_TASKS: SalesTask[] = [];
const INITIAL_LOGS: ActionLog[] = [];

// --- Firestore Error Handling per Firebase Integration Skill ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('[Firestore Error] Structured Diagnostics:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively removes properties with undefined values from objects and arrays,
 * so Firestore never encounters unsupported undefined field values in nested structures.
 */
export function cleanUndefined<T>(val: T): T {
  if (val === null || val === undefined) {
    return val;
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => cleanUndefined(item)) as unknown as T;
  }
  if (typeof val === "object" && !(val instanceof Date)) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(val as Record<string, any>)) {
      const v = (val as Record<string, any>)[key];
      if (v !== undefined) {
        result[key] = cleanUndefined(v);
      }
    }
    return result as T;
  }
  return val;
}

// Mapping from old string IDs to email keys to implement "role assigned to email id"
const ID_TO_EMAIL: Record<string, string> = {
  "admin-1": "naveen@chsurya.in",
  "admin-2": "gcp@aromaorganic.in",
  "admin-3": "velu@aromaorganic.in"
};

// Helper: map a user ID or email to email
export function mapIdToEmail(id: string): string {
  if (id.includes("@")) return id.toLowerCase();
  return (ID_TO_EMAIL[id] || id).toLowerCase();
}

export async function seedTeamsIfEmpty(): Promise<void> {
  try {
    const teamsSnap = await getDocs(collection(db, "teams"));
    if (!teamsSnap.empty) {
      return;
    }
    console.log("[FirebaseService] Seeding default teams...");
    const defaultTeams = [
      { name: "Executive", description: "Executive team and Board" },
      { name: "Enterprise Sales", description: "Enterprise clients management" },
      { name: "Mid-Market Team A", description: "Mid-market accounts - Area A" },
      { name: "Mid-Market Team B", description: "Mid-market accounts - Area B" },
      { name: "SME West Coast", description: "Small and medium business - West Coast" },
      { name: "SME East Coast", description: "Small and medium business - East Coast" }
    ];
    await Promise.all(
      defaultTeams.map(async (team) => {
        const docId = team.name.toLowerCase().replace(/[^a-z0-9]/g, "-") || "default";
        const t: Team = {
          id: docId,
          name: team.name,
          description: team.description,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, "teams", docId), cleanUndefined(t));
      })
    );
    console.log("[FirebaseService] Teams seeding completed successfully.");
  } catch (err) {
    console.error("[FirebaseService] Error seeding teams:", err);
  }
}

export async function seedProductsIfEmpty(): Promise<void> {
  try {
    const productsSnap = await getDocs(collection(db, "products"));
    if (!productsSnap.empty) {
      return;
    }
    console.log("[FirebaseService] Seeding default products...");
    await Promise.all(
      INITIAL_PRODUCTS.map((p) => setDoc(doc(db, "products", p.id), cleanUndefined(p)))
    );
    console.log("[FirebaseService] Products seeding completed successfully.");
  } catch (err) {
    console.error("[FirebaseService] Error seeding products:", err);
  }
}

import { BUILTIN_FAQS } from "../components/AboutMeView";

export async function seedFaqsIfEmpty(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, "faqs"));
    if (!snap.empty) return;
    console.log("[FirebaseService] Seeding default FAQs...");
    await Promise.all(BUILTIN_FAQS.map((f) => setDoc(doc(db, "faqs", f.id), cleanUndefined(f))));
  } catch (err) {
    console.error("[FirebaseService] Error seeding faqs:", err);
  }
}


export async function seedDropdownsIfEmpty(): Promise<void> {
  try {
    const collectionsToSeed = [
      {
        col: "freight_terms",
        items: ["FOR Destination", "Ex-Works Factory", "FOB", "CIF"],
        prefix: "ft"
      },
      {
        col: "delivery_terms",
        items: ["Door Delivery", "Transporter Godown Delivery at Destination", "Party Vehicle (self Pickup)"],
        prefix: "dt"
      }
    ];

    await Promise.all(
      collectionsToSeed.map(async ({ col, items, prefix }) => {
        try {
          const snap = await getDocs(collection(db, col));
          if (snap.empty && items.length > 0) {
            await Promise.all(
              items.map((name, idx) =>
                setDoc(doc(db, col, `${prefix}-${idx + 1}`), {
                  id: `${prefix}-${idx + 1}`,
                  name,
                  createdAt: new Date().toISOString()
                })
              )
            );
          }
        } catch (colErr) {
          console.error(`[FirebaseService] Error seeding ${col}:`, colErr);
        }
      })
    );
  } catch (err) {
    console.error("[FirebaseService] Error seeding dropdowns:", err);
  }
}

/**
 * Seeds Database with initial mock data mapped to emails if users collection is empty.
 */
export async function seedDatabaseIfEmpty(): Promise<void> {
  const path = "users";
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    await seedDropdownsIfEmpty();
    if (!usersSnap.empty) {
      console.log("[FirebaseService] Database already seeded.");
      await seedTeamsIfEmpty();
      await seedProductsIfEmpty();
      await seedFaqsIfEmpty();
      return;
    }

    console.log("[FirebaseService] Database empty. Starting email-keyed data seed...");
    await seedTeamsIfEmpty();
    await seedProductsIfEmpty();
    await seedFaqsIfEmpty();

    // 1. Seed Initial Users (document key is lowercase email)
    const seededUsers: User[] = INITIAL_USERS.map((user) => {
      const email = user.email.toLowerCase();
      return {
        ...user,
        id: email, // use email as ID
        email,
        reportsTo: user.reportsTo ? mapIdToEmail(user.reportsTo) : undefined
      };
    });

    for (const u of seededUsers) {
      await setDoc(doc(db, "users", u.email), cleanUndefined(u));
    }

    // 2. Seed Workflows if available
    for (const w of INITIAL_WORKFLOWS) {
      await setDoc(doc(db, "workflows", w.id), cleanUndefined(w));
    }

    console.log("[FirebaseService] Initial database seeding completed successfully!");
  } catch (err) {
    console.error("[FirebaseService] Error during seeding:", err);
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Checks if user details exist in `/users/{email}` on Firestore.
 * If user details exist, returns the User profile with assigned role & team access rights.
 * If user details do NOT exist, returns null so system redirects to the Pending Onboarding page.
 * Super Admin / Developer emails are auto-provisioned to prevent system lockout.
 */
export async function syncUserProfile(email: string, displayName: string, avatarUrl?: string): Promise<User | null> {
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail) return null;

  const userRef = doc(db, "users", normalizedEmail);
  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${normalizedEmail}`);
  }

  if (snap.exists()) {
    const existing = snap.data() as User;
    let needsUpdate = false;
    let updated = { ...existing };

    if (avatarUrl && existing.avatarUrl !== avatarUrl) {
      updated.avatarUrl = avatarUrl;
      needsUpdate = true;
    }
    if (displayName && (!existing.name || existing.name === normalizedEmail.split("@")[0])) {
      updated.name = displayName;
      needsUpdate = true;
    }

    if (needsUpdate) {
      try {
        await setDoc(userRef, cleanUndefined(updated));
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${normalizedEmail}`);
      }
      return updated;
    }
    return existing;
  }

  // Developer / Super Admin auto-provision fallback
  if (
    normalizedEmail === "naveen@chsurya.in" ||
    normalizedEmail === "whirlpoolveen@gmail.com" ||
    normalizedEmail === "velu@aromaorganic.in" ||
    normalizedEmail === "gcp@aromaorganic.in"
  ) {
    const adminUser: User = {
      id: normalizedEmail,
      name: displayName || (normalizedEmail === "velu@aromaorganic.in" ? "Velu Admin" : normalizedEmail === "gcp@aromaorganic.in" ? "AOL GCP" : normalizedEmail.split("@")[0]),
      role: Role.Admin,
      accessLevel: AccessLevel.Manager,
      email: normalizedEmail,
      avatarUrl: avatarUrl || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120",
      targetQuota: 250000,
      teamName: "Executive"
    };

    try {
      await setDoc(userRef, cleanUndefined(adminUser));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${normalizedEmail}`);
    }
    return adminUser;
  }

  // If user details NOT found in Firestore user database
  return null;
}

// REST OF EVENT SUBSCRIPTIONS / WRITERS TO FIRESTORE

export function subscribeCollection<T>(
  colName: string,
  onUpdate: (data: T[]) => void,
  sortField?: string
) {
  const colRef = collection(db, colName);
  const q = sortField ? query(colRef, orderBy(sortField, "desc")) : colRef;
  return onSnapshot(q, (snapshot) => {
    const list: T[] = [];
    snapshot.forEach((d) => {
      list.push({ ...d.data() } as T);
    });
    onUpdate(list);
  }, (error) => {
    console.warn(`[Firestore] Subscription error for collection '${colName}':`, error?.message || error);
    onUpdate([]);
  });
}

// Custom specialized writers/updaters

export async function saveTask(task: SalesTask): Promise<void> {
  try {
    await setDoc(doc(db, "tasks", task.id), cleanUndefined(task));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `tasks/${task.id}`);
  }
}

export async function deleteTaskDoc(taskId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "tasks", taskId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `tasks/${taskId}`);
  }
}

export async function saveWorkflow(workflow: ProjectWorkflow): Promise<void> {
  try {
    await setDoc(doc(db, "workflows", workflow.id), cleanUndefined(workflow));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workflows/${workflow.id}`);
  }
}

export async function isAuditLogEnabled(): Promise<boolean> {
  try {
    const docSnap = await getDoc(doc(db, "settings", "auditLogStatus"));
    if (docSnap.exists()) {
      return !!docSnap.data().enabled;
    }
    return true;
  } catch (err) {
    return true;
  }
}

export async function setAuditLogEnabled(enabled: boolean): Promise<void> {
  try {
    await setDoc(doc(db, "settings", "auditLogStatus"), { enabled });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "settings/auditLogStatus");
  }
}

export async function saveLog(log: ActionLog): Promise<void> {
  try {
    const enabled = await isAuditLogEnabled();
    if (enabled) {
      await setDoc(doc(db, "logs", log.id), cleanUndefined(log));
    }
  } catch (err: any) {
    console.warn(`[FirebaseService] Could not save audit log to Firestore (${log.id}):`, err?.message || err);
  }
}

export async function clearAllLogsInFirestore(logs: ActionLog[]): Promise<void> {
  for (const l of logs) {
    try {
      await deleteDoc(doc(db, "logs", l.id));
    } catch (err: any) {
      console.warn(`[FirebaseService] Could not delete log in Firestore (${l.id}):`, err?.message || err);
    }
  }
}

export async function updateUserDetails(userId: string, updates: Partial<User>, existingUser?: User): Promise<void> {
  const normId = userId.toLowerCase().trim();
  const userRef = doc(db, "users", normId);
  try {
    const cleanedUpdates = cleanUndefined(updates);
    const payload: Record<string, any> = {
      ...cleanedUpdates,
      id: normId,
      email: normId,
      updatedAt: new Date().toISOString()
    };
    await setDoc(userRef, payload, { merge: true });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[FirebaseService] Firestore write warning for users/${userId}:`, msg);
    if (msg.includes("permission") || msg.includes("Missing or insufficient permissions") || err?.code === "permission-denied") {
      console.warn(`[FirebaseService] Permission restricted on remote database for user ${userId}. Applied update to active session state.`);
      return;
    }
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
  }
}

export async function saveTeamTabSettings(
  teamName: string,
  visibleTabs: string[],
  visibleSubTabs: { [key: string]: string[] },
  visibleSubSubTabs: { [key: string]: { [key: string]: string[] } },
  teamPermissions?: { [tabId: string]: { view: boolean; edit: boolean; add: boolean } },
  levelWiseFilters?: { [tabOrSubTabId: string]: boolean }
): Promise<void> {
  const docId = teamName.toLowerCase().replace(/[^a-z0-9]/g, "-") || "default";
  try {
    const payload: any = {
      id: docId,
      teamName,
      visibleTabs,
      visibleSubTabs,
      visibleSubSubTabs,
    };
    if (teamPermissions) {
      payload.teamPermissions = teamPermissions;
    }
    if (levelWiseFilters) {
      payload.levelWiseFilters = levelWiseFilters;
    }
    await setDoc(doc(db, "tabSettings", docId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `tabSettings/${docId}`);
  }
}

export async function saveClient(client: Client): Promise<void> {
  try {
    await setDoc(doc(db, "clients", client.id), cleanUndefined(client));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `clients/${client.id}`);
  }
}

export async function deleteClientDoc(clientId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "clients", clientId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `clients/${clientId}`);
  }
}

export async function saveTeam(team: Team): Promise<void> {
  try {
    await setDoc(doc(db, "teams", team.id), cleanUndefined(team));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `teams/${team.id}`);
  }
}

export async function deleteTeamDoc(teamId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "teams", teamId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `teams/${teamId}`);
  }
}

export async function saveProduct(product: Product): Promise<void> {
  try {
    await setDoc(doc(db, "products", product.id), cleanUndefined(product));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `products/${product.id}`);
  }
}

export async function deleteProductDoc(productId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "products", productId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `products/${productId}`);
  }
}

export async function saveOrder(order: OrderOffer): Promise<void> {
  try {
    await setDoc(doc(db, "orders", order.id), cleanUndefined(order));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `orders/${order.id}`);
  }
}

export async function deleteOrderDoc(orderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "orders", orderId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `orders/${orderId}`);
  }
}

export async function savePaymentBank(bank: PaymentBank): Promise<void> {
  try {
    await setDoc(doc(db, "payment_banks", bank.id), cleanUndefined(bank));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `payment_banks/${bank.id}`);
  }
}

export async function deletePaymentBankDoc(bankId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "payment_banks", bankId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `payment_banks/${bankId}`);
  }
}

export async function saveProductCategory(category: ProductCategory): Promise<void> {
  try {
    await setDoc(doc(db, "product_categories", category.id), cleanUndefined(category));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `product_categories/${category.id}`);
  }
}

export async function deleteProductCategoryDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "product_categories", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `product_categories/${id}`);
  }
}

export async function saveProductGroup(group: ProductGroup): Promise<void> {
  try {
    await setDoc(doc(db, "product_groups", group.id), cleanUndefined(group));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `product_groups/${group.id}`);
  }
}

export async function deleteProductGroupDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "product_groups", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `product_groups/${id}`);
  }
}

export async function saveManufacturer(manufacturer: Manufacturer): Promise<void> {
  try {
    await setDoc(doc(db, "manufacturers", manufacturer.id), cleanUndefined(manufacturer));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `manufacturers/${manufacturer.id}`);
  }
}

export async function deleteManufacturerDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "manufacturers", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `manufacturers/${id}`);
  }
}

export async function saveFreightTerm(item: FreightTerm): Promise<void> {
  try {
    await setDoc(doc(db, "freight_terms", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `freight_terms/${item.id}`);
  }
}

export async function deleteFreightTermDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "freight_terms", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `freight_terms/${id}`);
  }
}

export async function saveDeliveryTerm(item: DeliveryTerm): Promise<void> {
  try {
    await setDoc(doc(db, "delivery_terms", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `delivery_terms/${item.id}`);
  }
}

export async function deleteDeliveryTermDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "delivery_terms", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `delivery_terms/${id}`);
  }
}

export async function saveTransporter(item: TransporterName): Promise<void> {
  try {
    await setDoc(doc(db, "transporters", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `transporters/${item.id}`);
  }
}

export async function deleteTransporterDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "transporters", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `transporters/${id}`);
  }
}

export async function saveWarehouse(item: WarehouseManagedBy): Promise<void> {
  try {
    await setDoc(doc(db, "warehouses", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `warehouses/${item.id}`);
  }
}

export async function deleteWarehouseDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "warehouses", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `warehouses/${id}`);
  }
}

export async function saveDispatchLocation(item: DispatchLocation): Promise<void> {
  try {
    await setDoc(doc(db, "dispatch_locations", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `dispatch_locations/${item.id}`);
  }
}

export async function deleteDispatchLocationDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "dispatch_locations", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `dispatch_locations/${id}`);
  }
}

export async function saveEmailTemplate(template: EmailTemplate): Promise<void> {
  try {
    await setDoc(doc(db, "email_templates", template.id), cleanUndefined(template));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `email_templates/${template.id}`);
  }
}

export async function deleteEmailTemplateDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "email_templates", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `email_templates/${id}`);
  }
}

export async function getEmailAutoSelectSettings(): Promise<EmailAutoSelectSettings> {
  try {
    const docSnap = await getDoc(doc(db, "settings", "email_auto_select"));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        indentAutoSelect: data.indentAutoSelect ?? true,
        ordersAutoSelect: data.ordersAutoSelect ?? false,
      };
    }
    return {
      indentAutoSelect: true,
      ordersAutoSelect: false,
    };
  } catch (err) {
    console.error("Error getting email_auto_select settings:", err);
    return {
      indentAutoSelect: true,
      ordersAutoSelect: false,
    };
  }
}

export async function saveEmailAutoSelectSettings(settings: EmailAutoSelectSettings): Promise<void> {
  try {
    await setDoc(doc(db, "settings", "email_auto_select"), settings);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "settings/email_auto_select");
  }
}

export async function getEmailSendingConfig(): Promise<EmailSendingConfig> {
  try {
    const docSnap = await getDoc(doc(db, "settings", "email_sending_config"));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        mode: "google_apps_script",
        gasWebUrl: data.gasWebUrl || "",
        userGasConfigs: data.userGasConfigs || {},
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
    return {
      mode: "google_apps_script",
      gasWebUrl: "",
      userGasConfigs: {},
    };
  } catch (err) {
    console.error("Error getting email_sending_config settings:", err);
    return {
      mode: "google_apps_script",
      gasWebUrl: "",
      userGasConfigs: {},
    };
  }
}

export async function saveEmailSendingConfig(config: EmailSendingConfig): Promise<void> {
  try {
    await setDoc(doc(db, "settings", "email_sending_config"), cleanUndefined(config));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "settings/email_sending_config");
  }
}

export async function savePaymentDetails(paymentDetails: PaymentDetails): Promise<void> {
  try {
    await setDoc(doc(db, "payment_details", paymentDetails.orderId), cleanUndefined(paymentDetails), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `payment_details/${paymentDetails.orderId}`);
  }
}

export async function savePaymentTerm(item: PaymentTerm): Promise<void> {
  try {
    await setDoc(doc(db, "payment_terms", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `payment_terms/${item.id}`);
  }
}

export async function deletePaymentTermDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "payment_terms", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `payment_terms/${id}`);
  }
}

export async function savePaymentCreditPeriod(item: PaymentCreditPeriod): Promise<void> {
  try {
    await setDoc(doc(db, "payment_credit_periods", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `payment_credit_periods/${item.id}`);
  }
}

export async function deletePaymentCreditPeriodDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "payment_credit_periods", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `payment_credit_periods/${id}`);
  }
}

export async function saveFAQ(item: FAQItem): Promise<void> {
  try {
    await setDoc(doc(db, "faqs", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `faqs/${item.id}`);
  }
}

export async function deleteFAQDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "faqs", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `faqs/${id}`);
  }
}

export async function saveBugRequest(item: BugRequest): Promise<void> {
  try {
    await setDoc(doc(db, "bug_requests", item.id), cleanUndefined(item));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `bug_requests/${item.id}`);
  }
}

export async function deleteBugRequestDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "bug_requests", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `bug_requests/${id}`);
  }
}

export function subscribeTaxRates(onUpdate: (data: TaxRate[]) => void) {
  const docRef = doc(db, "settings", "tax_rates");
  return onSnapshot(docRef, (snap) => {
    if (snap.exists() && Array.isArray(snap.data()?.items) && snap.data().items.length > 0) {
      onUpdate(snap.data().items);
    } else {
      onUpdate(INITIAL_TAX_RATES);
    }
  }, (error) => {
    console.warn("Could not load settings/tax_rates from firestore, using defaults:", error);
    onUpdate(INITIAL_TAX_RATES);
  });
}

export async function saveTaxRatesList(items: TaxRate[]): Promise<void> {
  try {
    await setDoc(doc(db, "settings", "tax_rates"), {
      items: cleanUndefined(items),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "settings/tax_rates");
  }
}

export async function getEmailLimitsConfig(): Promise<EmailLimitsConfig> {
  try {
    const docSnap = await getDoc(doc(db, "settings", "email_limits_config"));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        offerLimit: typeof data.offerLimit === 'number' ? data.offerLimit : 50,
        orderLimit: typeof data.orderLimit === 'number' ? data.orderLimit : 30,
        paymentLimit: typeof data.paymentLimit === 'number' ? data.paymentLimit : 200,
        
        // Event specific fallback
        create_order: typeof data.create_order === 'number' ? data.create_order : 50,
        edit_order: typeof data.edit_order === 'number' ? data.edit_order : 50,
        invoice_issuance: typeof data.invoice_issuance === 'number' ? data.invoice_issuance : 30,
        payment_reminder: typeof data.payment_reminder === 'number' ? data.payment_reminder : 100,
        payment_reminder_consolidated: typeof data.payment_reminder_consolidated === 'number' ? data.payment_reminder_consolidated : 100,
      };
    }
    return {
      offerLimit: 50,
      orderLimit: 30,
      paymentLimit: 200,
      create_order: 50,
      edit_order: 50,
      invoice_issuance: 30,
      payment_reminder: 100,
      payment_reminder_consolidated: 100
    };
  } catch (err) {
    console.error("Error getting email_limits_config:", err);
    return {
      offerLimit: 50,
      orderLimit: 30,
      paymentLimit: 200,
      create_order: 50,
      edit_order: 50,
      invoice_issuance: 30,
      payment_reminder: 100,
      payment_reminder_consolidated: 100
    };
  }
}

export async function saveEmailLimitsConfig(config: EmailLimitsConfig): Promise<void> {
  try {
    await setDoc(doc(db, "settings", "email_limits_config"), config);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, "settings/email_limits_config");
  }
}

export async function getEmailDailyCounts(dateStr: string): Promise<EmailDailyCounts> {
  try {
    const docSnap = await getDoc(doc(db, "email_daily_counts", dateStr));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        offerSent: data.offerSent || 0,
        orderSent: data.orderSent || 0,
        paymentSent: data.paymentSent || 0,

        create_order: data.create_order || 0,
        edit_order: data.edit_order || 0,
        invoice_issuance: data.invoice_issuance || 0,
        payment_reminder: data.payment_reminder || 0,
        payment_reminder_consolidated: data.payment_reminder_consolidated || 0,
      };
    }
    return {
      offerSent: 0,
      orderSent: 0,
      paymentSent: 0,
      create_order: 0,
      edit_order: 0,
      invoice_issuance: 0,
      payment_reminder: 0,
      payment_reminder_consolidated: 0,
    };
  } catch (err) {
    console.error("Error getting email_daily_counts:", err);
    return {
      offerSent: 0,
      orderSent: 0,
      paymentSent: 0,
      create_order: 0,
      edit_order: 0,
      invoice_issuance: 0,
      payment_reminder: 0,
      payment_reminder_consolidated: 0,
    };
  }
}

// Bad Debtors Firestore CRUD
export function subscribeBadDebtors(onUpdate: (data: BadDebtor[]) => void) {
  return subscribeCollection<BadDebtor>("bad_debtors", onUpdate, "createdAt");
}

export async function saveBadDebtor(debtor: BadDebtor): Promise<void> {
  try {
    await setDoc(doc(db, "bad_debtors", debtor.id), cleanUndefined(debtor), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `bad_debtors/${debtor.id}`);
  }
}

export async function deleteBadDebtorDoc(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "bad_debtors", id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `bad_debtors/${id}`);
  }
}

// Email Sent Logs Firestore CRUD
export function subscribeEmailSentLogs(onUpdate: (data: EmailSentLog[]) => void) {
  return subscribeCollection<EmailSentLog>("email_sent_logs", onUpdate, "timestamp");
}

export async function saveEmailSentLog(log: EmailSentLog): Promise<void> {
  try {
    const cleaned = cleanUndefined(log);
    await setDoc(doc(db, "email_sent_logs", log.id), cleaned, { merge: true });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.warn(`[FirebaseService] Could not save email sent log to Firestore (${log.id}):`, msg);
    if (msg.includes("permission") || msg.includes("Missing or insufficient permissions") || err?.code === "permission-denied") {
      console.warn(`[FirebaseService] Permission restricted on remote database for email_sent_logs/${log.id}.`);
      return;
    }
  }
}




