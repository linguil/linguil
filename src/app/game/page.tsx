import nextDynamic from 'next/dynamic';
import { GlobalLoadingSpinner } from '@/components/common/GlobalLoadingSpinner';
import { AnalyticsTracker } from '@/components/common/AnalyticsTracker';
import { getDailyWordData } from '@/lib/game/data-service-server';

// Dynamically import the GamePageClient to reduce the initial bundle size and show a loading spinner as a fallback.
const GamePageClient = nextDynamic(() => import('./GamePageClient'), { loading: () => <GlobalLoadingSpinner /> });

// Force dynamic evaluation so the current day's word is always fetched on each request.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// This server component pre-fetches the daily word data and passes it to the client component.
export default async function GamePage() {
  const dailyWord = await getDailyWordData().catch(() => null);

  return (
    <>
      <GamePageClient initialDailyWord={dailyWord} />
      <AnalyticsTracker />
    </>
  );
}