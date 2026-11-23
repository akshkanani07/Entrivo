import { FeedbackForm } from "../../FeedbackForm";

export default async function OrganizationQrFeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <FeedbackForm kind="GENERIC_QR" token={decodeURIComponent(token)} />;
}
