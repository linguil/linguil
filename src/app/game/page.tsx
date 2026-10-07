import dynamic from 'next/dynamic';
import { GlobalLoadingSpinner } from '@/components/common/GlobalLoadingSpinner';
import { AnalyticsTracker } from '@/components/common/AnalyticsTracker';
import { getDailyWordData } from '@/lib/game/data-service-server';

// Dynamically import the GamePageClient to reduce the initial bundle size and show a loading spinner as a fallback.
const GamePageClient = dynamic(() => import('./GamePageClient'), { loading: () => <GlobalLoadingSpinner /> });

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