import { EmailMessageDetail } from "@/components/crm/email-center"

export const dynamic = "force-dynamic"

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EmailMessageDetail id={id} />
}
