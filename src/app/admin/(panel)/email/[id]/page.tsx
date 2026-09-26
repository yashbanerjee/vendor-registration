import { EmailCampaignDetail } from "@/components/crm/email-center"

export const dynamic = "force-dynamic"

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EmailCampaignDetail id={id} />
}
