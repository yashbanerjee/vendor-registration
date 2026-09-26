import { decideAccess, moduleAllowed } from "../src/lib/access-policy"

function assert(name: string, value: string, expected: string) {
  if (value !== expected) {
    console.error(`${name}: expected ${expected}, got ${value}`)
    process.exitCode = 1
  }
}

const orgA = { portal: "ADMIN" as const, organizationId: "org-a", vendorId: null, isOrgAdmin: true, teamAdminIds: [] }
const orgB = { ...orgA, organizationId: "org-b" }
const superAdmin = { portal: "SUPER_ADMIN" as const, organizationId: null, vendorId: null, isOrgAdmin: false, teamAdminIds: [] }
const teamAdmin = { portal: "ADMIN" as const, organizationId: "org-a", vendorId: null, isOrgAdmin: false, teamAdminIds: ["team-a"] }
const vendorA = { portal: "VENDOR" as const, organizationId: "org-a", vendorId: "vendor-a", isOrgAdmin: false, teamAdminIds: [] }

assert("super admin business", decideAccess(superAdmin, { module: "invoices", organizationId: "org-a" }), "deny")
assert("super admin platform", decideAccess(superAdmin, { module: "settings" }), "allow")
assert("org isolation", decideAccess(orgA, { module: "vendors", organizationId: "org-b" }), "deny")
assert("same org", decideAccess(orgB, { module: "vendors", organizationId: "org-b" }), "allow")
assert("team admin other team", decideAccess(teamAdmin, { module: "approvals", teamId: "team-b" }), "deny")
assert("team admin own team", decideAccess(teamAdmin, { module: "approvals", teamId: "team-a", organizationId: "org-a" }), "allow")
assert("team admin settings", decideAccess(teamAdmin, { module: "settings" }), "deny")
assert("vendor other vendor", decideAccess(vendorA, { module: "invoices", vendorId: "vendor-b", organizationId: "org-a" }), "deny")
assert("vendor own", decideAccess(vendorA, { module: "invoices", vendorId: "vendor-a", organizationId: "org-a" }), "allow")
assert("admin platform features", moduleAllowed("ADMIN", "features", true) ? "allow" : "deny", "allow")
assert("super admin invoices hidden", moduleAllowed("SUPER_ADMIN", "invoices", true) ? "allow" : "deny", "deny")

if (process.exitCode) process.exit(process.exitCode)
console.log("access policy checks passed")
