import { ApiError } from "@/server/errors"
import { assertSameOrigin } from "@/server/http"
import * as auth from "@/server/handlers/auth"
import * as vendors from "@/server/handlers/vendors"
import * as importer from "@/server/handlers/import"
import * as catalog from "@/server/handlers/catalog"
import * as commercial from "@/server/handlers/commercial"
import * as operations from "@/server/handlers/operations"
import * as finance from "@/server/handlers/finance"
import * as platform from "@/server/handlers/platform"

type Handler = (req: Request, params: Record<string, string>) => Promise<Response>

const routes: { method: string; pattern: string; handler: Handler }[] = [
  { method: "GET", pattern: "health", handler: () => platform.health() },
  { method: "GET", pattern: "auth/setup", handler: () => auth.setupStatus() },
  { method: "POST", pattern: "auth/setup", handler: (req) => auth.setup(req) },
  { method: "POST", pattern: "auth/login", handler: (req) => auth.login(req) },
  { method: "POST", pattern: "auth/password", handler: (req) => auth.changePassword(req) },
  { method: "POST", pattern: "auth/logout", handler: (req) => auth.logout(req) },
  { method: "GET", pattern: "auth/session", handler: () => auth.session() },
  { method: "POST", pattern: "auth/register", handler: (req) => auth.register(req) },
  { method: "PATCH", pattern: "auth/register", handler: (req) => auth.saveRegistration(req) },
  { method: "POST", pattern: "auth/register/submit", handler: (req) => auth.submitRegistration(req) },
  { method: "GET", pattern: "auth/registration-form", handler: () => auth.registrationForm() },

  { method: "GET", pattern: "vendors/import/template", handler: (req) => importer.importTemplateResponse(req) },
  { method: "POST", pattern: "vendors/import/preview", handler: (req) => importer.importPreview(req) },
  { method: "POST", pattern: "vendors/import/commit", handler: (req) => importer.importCommit(req) },
  { method: "GET", pattern: "vendors/import/jobs", handler: () => importer.listImportJobs() },
  { method: "GET", pattern: "vendors", handler: (req) => vendors.listVendors(req) },
  { method: "POST", pattern: "vendors", handler: (req) => vendors.createVendor(req) },
  { method: "GET", pattern: "vendor-applications", handler: (req) => vendors.listApplications(req) },
  { method: "GET", pattern: "vendors/:id", handler: (req, params) => vendors.getVendor(req, params) },
  { method: "PATCH", pattern: "vendors/:id", handler: (req, params) => vendors.updateVendor(req, params) },
  { method: "DELETE", pattern: "vendors/:id", handler: (req, params) => vendors.deleteVendor(req, params) },
  { method: "POST", pattern: "vendors/:id/review", handler: (req, params) => vendors.reviewVendor(req, params) },
  { method: "POST", pattern: "vendors/:id/field-reviews", handler: (req, params) => vendors.flagVendorField(req, params) },
  { method: "GET", pattern: "vendors/:id/activity", handler: (req, params) => vendors.vendorActivity(req, params) },
  { method: "POST", pattern: "vendors/:id/invite", handler: (req, params) => vendors.inviteVendor(req, params) },

  { method: "GET", pattern: "vendor-documents", handler: (req) => catalog.listDocuments(req) },
  { method: "POST", pattern: "vendor-documents", handler: (req) => catalog.createDocument(req) },
  { method: "POST", pattern: "vendor-documents/:id/review", handler: (req, params) => catalog.reviewDocument(req, params) },
  { method: "GET", pattern: "vendor-categories", handler: () => catalog.listCategories() },
  { method: "POST", pattern: "vendor-categories", handler: (req) => catalog.saveCategory(req, {}) },
  { method: "PATCH", pattern: "vendor-categories/:id", handler: (req, params) => catalog.saveCategory(req, params) },
  { method: "DELETE", pattern: "vendor-categories/:id", handler: (req, params) => catalog.deleteCategory(req, params) },
  { method: "GET", pattern: "vendor-services", handler: () => catalog.listServices() },
  { method: "POST", pattern: "vendor-services", handler: (req) => catalog.saveService(req, {}) },
  { method: "PATCH", pattern: "vendor-services/:id", handler: (req, params) => catalog.saveService(req, params) },
  { method: "DELETE", pattern: "vendor-services/:id", handler: (req, params) => catalog.deleteService(req, params) },
  { method: "GET", pattern: "document-types", handler: () => catalog.listDocumentTypes() },
  { method: "POST", pattern: "document-types", handler: (req) => catalog.saveDocumentType(req, {}) },
  { method: "PATCH", pattern: "document-types/:id", handler: (req, params) => catalog.saveDocumentType(req, params) },
  { method: "GET", pattern: "custom-fields", handler: () => catalog.listCustomFields() },
  { method: "POST", pattern: "custom-fields", handler: (req) => catalog.saveCustomField(req, {}) },
  { method: "PATCH", pattern: "custom-fields/:id", handler: (req, params) => catalog.saveCustomField(req, params) },
  { method: "DELETE", pattern: "custom-fields/:id", handler: (req, params) => catalog.deleteCustomField(req, params) },
  { method: "GET", pattern: "payment-terms", handler: () => catalog.listTerms() },
  { method: "POST", pattern: "payment-terms", handler: (req) => catalog.saveTerm(req, {}) },
  { method: "PATCH", pattern: "payment-terms/:id", handler: (req, params) => catalog.saveTerm(req, params) },
  { method: "GET", pattern: "emirates", handler: () => catalog.listEmirates() },
  { method: "POST", pattern: "emirates", handler: (req) => catalog.saveEmirate(req, {}) },
  { method: "PATCH", pattern: "emirates/:id", handler: (req, params) => catalog.saveEmirate(req, params) },
  { method: "GET", pattern: "workflows", handler: () => catalog.listWorkflows() },
  { method: "POST", pattern: "workflows", handler: (req) => catalog.saveWorkflow(req, {}) },
  { method: "PATCH", pattern: "workflows/:id", handler: (req, params) => catalog.saveWorkflow(req, params) },
  { method: "DELETE", pattern: "workflows/:id", handler: (req, params) => catalog.deleteWorkflow(req, params) },

  { method: "GET", pattern: "events", handler: (req) => commercial.listEvents(req) },
  { method: "POST", pattern: "events", handler: (req) => commercial.saveEvent(req, {}) },
  { method: "GET", pattern: "events/:id", handler: (req, params) => commercial.getEvent(req, params) },
  { method: "PATCH", pattern: "events/:id", handler: (req, params) => commercial.saveEvent(req, params) },
  { method: "DELETE", pattern: "events/:id", handler: (req, params) => commercial.deleteEvent(req, params) },
  { method: "POST", pattern: "events/:id/vendors", handler: (req, params) => commercial.assignEventVendor(req, params) },
  { method: "DELETE", pattern: "event-vendors/:id", handler: (req, params) => commercial.removeEventVendor(req, params) },

  { method: "GET", pattern: "rfqs", handler: (req) => commercial.listRfqs(req) },
  { method: "POST", pattern: "rfqs", handler: (req) => commercial.saveRfq(req, {}) },
  { method: "PATCH", pattern: "rfqs/:id", handler: (req, params) => commercial.saveRfq(req, params) },
  { method: "POST", pattern: "rfqs/:id/respond", handler: (req, params) => commercial.respondRfq(req, params) },
  { method: "GET", pattern: "quotations", handler: (req) => commercial.listQuotations(req) },
  { method: "POST", pattern: "quotations", handler: (req) => commercial.saveQuotation(req, {}) },
  { method: "PATCH", pattern: "quotations/:id", handler: (req, params) => commercial.saveQuotation(req, params) },
  { method: "POST", pattern: "quotations/:id/status", handler: (req, params) => commercial.setQuotationStatus(req, params) },
  { method: "GET", pattern: "purchase-orders", handler: (req) => commercial.listPurchaseOrders(req) },
  { method: "POST", pattern: "purchase-orders", handler: (req) => commercial.savePurchaseOrder(req, {}) },
  { method: "PATCH", pattern: "purchase-orders/:id", handler: (req, params) => commercial.savePurchaseOrder(req, params) },
  { method: "GET", pattern: "purchase-orders/:id/pdf", handler: (req, params) => commercial.purchaseOrderPdf(req, params) },
  { method: "GET", pattern: "contracts", handler: (req) => commercial.listContracts(req) },
  { method: "POST", pattern: "contracts", handler: (req) => commercial.saveContract(req, {}) },
  { method: "PATCH", pattern: "contracts/:id", handler: (req, params) => commercial.saveContract(req, params) },

  { method: "GET", pattern: "tasks", handler: (req) => operations.listTasks(req) },
  { method: "POST", pattern: "tasks", handler: (req) => operations.saveTask(req, {}) },
  { method: "PATCH", pattern: "tasks/:id", handler: (req, params) => operations.saveTask(req, params) },
  { method: "POST", pattern: "tasks/:id/comments", handler: (req, params) => operations.commentTask(req, params) },
  { method: "GET", pattern: "deliveries", handler: (req) => operations.listDeliveries(req) },
  { method: "POST", pattern: "deliveries", handler: (req) => operations.saveDelivery(req, {}) },
  { method: "PATCH", pattern: "deliveries/:id", handler: (req, params) => operations.saveDelivery(req, params) },
  { method: "GET", pattern: "workforce", handler: (req) => operations.listWorkforce(req) },
  { method: "POST", pattern: "workforce", handler: (req) => operations.saveWorker(req, {}) },
  { method: "PATCH", pattern: "workforce/:id", handler: (req, params) => operations.saveWorker(req, params) },
  { method: "POST", pattern: "workforce/:id/review", handler: (req, params) => operations.reviewWorker(req, params) },
  { method: "GET", pattern: "gate-passes", handler: (req) => operations.listGatePasses(req) },
  { method: "POST", pattern: "gate-passes", handler: (req) => operations.createGatePass(req) },
  { method: "POST", pattern: "gate-passes/scan", handler: (req) => operations.scanGatePass(req) },
  { method: "GET", pattern: "gate-passes/:id/qr", handler: (req, params) => operations.gatePassQr(req, params) },

  { method: "GET", pattern: "invoices", handler: (req) => finance.listInvoices(req) },
  { method: "POST", pattern: "invoices", handler: (req) => finance.saveInvoice(req, {}) },
  { method: "PATCH", pattern: "invoices/:id", handler: (req, params) => finance.saveInvoice(req, params) },
  { method: "POST", pattern: "invoices/:id/review", handler: (req, params) => finance.reviewInvoice(req, params) },
  { method: "GET", pattern: "payments", handler: (req) => finance.listPayments(req) },
  { method: "POST", pattern: "payments", handler: (req) => finance.savePayment(req, {}) },
  { method: "PATCH", pattern: "payments/:id", handler: (req, params) => finance.savePayment(req, params) },
  { method: "GET", pattern: "performance", handler: (req) => finance.listPerformance(req) },
  { method: "POST", pattern: "performance", handler: (req) => finance.createPerformance(req) },
  { method: "GET", pattern: "tickets", handler: (req) => finance.listTickets(req) },
  { method: "POST", pattern: "tickets", handler: (req) => finance.saveTicket(req, {}) },
  { method: "PATCH", pattern: "tickets/:id", handler: (req, params) => finance.saveTicket(req, params) },
  { method: "POST", pattern: "tickets/:id/comments", handler: (req, params) => finance.commentTicket(req, params) },

  { method: "GET", pattern: "dashboard", handler: (req) => platform.dashboard(req) },
  { method: "GET", pattern: "search", handler: (req) => platform.search(req) },
  { method: "GET", pattern: "lookups", handler: () => platform.lookups() },
  { method: "POST", pattern: "uploads", handler: (req) => platform.upload(req) },
  { method: "GET", pattern: "files/:id", handler: (req, params) => platform.downloadFile(req, params) },
  { method: "GET", pattern: "public/site", handler: () => platform.publicSite() },
  { method: "POST", pattern: "public/contact", handler: (req) => platform.publicContact(req) },
  { method: "GET", pattern: "settings/company", handler: () => platform.getCompany() },
  { method: "PUT", pattern: "settings/company", handler: (req) => platform.saveCompany(req) },
  { method: "GET", pattern: "settings/tax", handler: () => platform.getTax() },
  { method: "PUT", pattern: "settings/tax", handler: (req) => platform.saveTax(req) },
  { method: "GET", pattern: "settings/system", handler: () => platform.getSystemSettings() },
  { method: "PUT", pattern: "settings/system", handler: (req) => platform.saveSystemSetting(req) },
  { method: "GET", pattern: "features", handler: () => platform.listFeatures() },
  { method: "PATCH", pattern: "features/:key", handler: (req, params) => platform.saveFeature(req, params) },
  { method: "GET", pattern: "settings/integrations", handler: () => platform.listIntegrations() },
  { method: "POST", pattern: "settings/integrations", handler: (req) => platform.saveIntegration(req) },
  { method: "GET", pattern: "users", handler: (req) => platform.listUsers(req) },
  { method: "POST", pattern: "users", handler: (req) => platform.saveUser(req, {}) },
  { method: "PATCH", pattern: "users/:id", handler: (req, params) => platform.saveUser(req, params) },
  { method: "DELETE", pattern: "users/:id", handler: (req, params) => platform.deleteUser(req, params) },
  { method: "GET", pattern: "roles", handler: () => platform.listRoles() },
  { method: "POST", pattern: "roles", handler: (req) => platform.saveRole(req, {}) },
  { method: "PATCH", pattern: "roles/:id", handler: (req, params) => platform.saveRole(req, params) },
  { method: "DELETE", pattern: "roles/:id", handler: (req, params) => platform.deleteRole(req, params) },
  { method: "GET", pattern: "notifications", handler: (req) => platform.listNotifications(req) },
  { method: "POST", pattern: "notifications/read", handler: (req) => platform.readNotifications(req) },
  { method: "GET", pattern: "notification-templates", handler: () => platform.listTemplates() },
  { method: "PATCH", pattern: "notification-templates/:id", handler: (req, params) => platform.saveTemplate(req, params) },
  { method: "GET", pattern: "audit-logs", handler: (req) => platform.listAudit(req) },
  { method: "GET", pattern: "reports", handler: (req) => platform.report(req) },
]

function match(pattern: string, parts: string[]) {
  const expected = pattern.split("/")
  if (expected.length !== parts.length) return null
  const params: Record<string, string> = {}
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index].startsWith(":")) params[expected[index].slice(1)] = decodeURIComponent(parts[index])
    else if (expected[index] !== parts[index]) return null
  }
  return params
}

export async function dispatch(req: Request, parts: string[], method: string) {
  assertSameOrigin(req)
  for (const route of routes) {
    if (route.method !== method) continue
    const params = match(route.pattern, parts)
    if (!params) continue
    return route.handler(req, params)
  }
  throw new ApiError(404, "This API route does not exist.")
}
