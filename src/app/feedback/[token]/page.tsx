import { FeedbackForm } from "../FeedbackForm";

export default async function EmailFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ nps?: string }>;
}) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  const nps = Number(search.nps);
  return (
    <FeedbackForm
      kind="EMAIL"
      token={decodeURIComponent(token)}
      initialScore={Number.isInteger(nps) ? nps : undefined}
    />
  );
}
