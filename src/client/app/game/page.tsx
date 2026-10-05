import { lazy, Suspense } from 'react';
import { GlobalLoadingSpinner } from '@/client/components/common/GlobalLoadingSpinner';

// Dynamically import the GamePageClient to reduce the initial bundle size and show a loading spinner as a fallback.
const GamePageClient = lazy(() => import('./GamePageClient'));

// This server component renders the game page, delegating data fetching to the client-side GamePageClient component.
export default function GamePage() {
  return (
    <Suspense fallback={<GlobalLoadingSpinner />}>
      <GamePageClient />
    </Suspense>
  );
}