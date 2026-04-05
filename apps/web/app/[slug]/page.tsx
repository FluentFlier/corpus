import { notFound } from 'next/navigation';
import { fetchProjectStats } from '@/lib/fetcher';
import { PolicyScore } from '@/components/PolicyScore';
import { ActionFeed } from '@/components/ActionFeed';
import { PolicyBreakdown } from '@/components/PolicyBreakdown';
import { TrendChart } from '@/components/TrendChart';
import { formatNumber } from '@/lib/format';

export const revalidate = 30;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Record<string, unknown>> {
  const data = await fetchProjectStats(params.slug);
  if (!data) return { title: 'Not found' };
  return {
    title: `${data.project.name} - Verified by Corpus`,
    description: `${data.stats.passRate}% of agent actions cleared policy verification. ${formatNumber(data.stats.totalRuns)} actions verified.`,
    openGraph: {
      title: `${data.project.name} is verified by Corpus`,
      description: `${data.stats.passRate}% pass rate across ${formatNumber(data.stats.totalRuns)} actions.`,
    },
  };
}

export default async function TrustPage({ params }: { params: { slug: string } }): Promise<React.ReactElement> {
  const data = await fetchProjectStats(params.slug);
  if (!data) notFound();

  const isVerified = data.stats.passRate >= 95;

  return (
    <main className="min-h-screen bg-corpus-bg bg-grid" role="main">
      {/* Nav */}
      <nav aria-label="Trust page navigation" className="flex items-center justify-between px-8 py-5">
        <a href="/" className="font-mono text-corpus-text text-sm tracking-tight" aria-label="Back to Corpus home">
          corpus
        </a>
        {isVerified && (
          <div className="flex items-center gap-2 text-xs text-corpus-green" role="status" aria-label="Verification status: Verified">
            <span className="w-2 h-2 rounded-full bg-corpus-green inline-block" aria-hidden="true" />
            Verified
          </div>
        )}
      </nav>

      <div className="max-w-4xl mx-auto px-8">
        {/* Hero */}
        <header className="pt-20 text-center">
          <h1 className="text-3xl font-medium tracking-tight" style={{ letterSpacing: '-0.02em' }}>
            {data.project.name}
          </h1>
          <p className="text-corpus-muted mt-2">is verified by Corpus</p>
        </header>

        {/* Policy Score */}
        <section aria-label="Policy pass rate" className="flex justify-center mt-20">
          <PolicyScore
            passRate={data.stats.passRate}
            passCount={data.stats.passCount}
            confirmCount={data.stats.confirmCount}
            blockCount={data.stats.blockCount}
            totalRuns={data.stats.totalRuns}
          />
        </section>

        <p className="text-center text-corpus-muted text-sm mt-6" aria-live="polite">
          Verified {formatNumber(data.stats.totalRuns)} agent actions
        </p>

        {/* Trend Chart */}
        <section aria-label="30-day pass rate trend" className="mt-12 max-w-[800px] mx-auto">
          <TrendChart data={data.dailyPassRate} />
        </section>

        {/* Two columns */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-5 gap-10">
          <section className="lg:col-span-3" aria-labelledby="breakdown-heading">
            <h2 id="breakdown-heading" className="text-xs text-corpus-muted uppercase tracking-wider mb-4">Policy breakdown</h2>
            <PolicyBreakdown policies={data.policyBreakdown} />
          </section>
          <section className="lg:col-span-2" aria-labelledby="activity-heading">
            <h2 id="activity-heading" className="text-xs text-corpus-muted uppercase tracking-wider mb-4">Recent activity</h2>
            <ActionFeed activity={data.recentActivity} />
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-20 pb-12 text-center text-xs text-corpus-muted" style={{ opacity: 0.5 }}>
          No user data stored. Policies are open source.
        </footer>
      </div>
    </main>
  );
}
