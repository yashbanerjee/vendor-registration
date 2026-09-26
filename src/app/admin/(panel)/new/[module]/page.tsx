import { redirect } from "next/navigation"
import { NewRecordPage } from "@/components/crm/new-record-page"

export const dynamic = "force-dynamic"

export default async function AdminNewRecord({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params
  if (module === "vendors") redirect("/admin/vendors/new")
  return <NewRecordPage portal="admin" moduleKey={module} />
}
