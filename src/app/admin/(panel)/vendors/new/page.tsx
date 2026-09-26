import { NewRecordPage } from "@/components/crm/new-record-page"

export const dynamic = "force-dynamic"

export default function NewVendorPage() {
  return <NewRecordPage portal="admin" moduleKey="vendors" />
}
