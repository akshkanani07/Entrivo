import { FeedbackForm } from "../../FeedbackForm";

export default async function VisitQrFeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <FeedbackForm kind="VISIT_QR" token={decodeURIComponent(token)} />;
}
