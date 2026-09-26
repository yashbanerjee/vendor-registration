import { NewRecordPage } from "@/components/crm/new-record-page"

export const dynamic = "force-dynamic"

export default async function VendorNewRecord({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params
  return <NewRecordPage portal="vendor" moduleKey={module} />
}