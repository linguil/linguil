'use client';

import { useEffect, memo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import Script from 'next/script';
import Cookies from 'js-cookie';
import { isDiscordEnvironment } from '@/lib/utils';

// Add the fbq function to the window interface to avoid TypeScript errors.
declare global {
  interface Window {
    fbq: (...args: any[]) => void;
  }
}

// Generates a fallback browser ID if the Meta Pixel fails to set one.
const generateFbp = (): string => {
  const timestamp = new Date().getTime();
  const random = Math.floor(Math.random() * 1e9);
  return `fb.1.${timestamp}.${random}`;
};

// Tracks page views, performance, and conversions using Firebase and Meta Pixel.
const AnalyticsTracker = memo(() => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isInsideDiscord } = useAuth();
  const inDiscord = isInsideDiscord || isDiscordEnvironment();
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  // Ensure client-side identifiers are available for server-side events.
  useEffect(() => {
    if (inDiscord) return;

    // 1. Capture Meta Click ID (fbclid) and set the _fbc cookie.
    try {
        const fbclid = searchParams.get('fbclid');
        if (fbclid) {
          const fbcValue = `fb.1.${Date.now()}.${fbclid}`;
          Cookies.set('_fbc', fbcValue, { expires: 90, path: '/', sameSite: 'Lax' });
        }
    } catch (_e) {}

    // 2. Ensure the _fbp cookie is set.
    try {
        const fbpValue = Cookies.get('_fbp');
        if (!fbpValue) {
          const newFbp = generateFbp();
          Cookies.set('_fbp', newFbp, { expires: 90, path: '/', sameSite: 'Lax' });
        }
    } catch (_e) {}
    
  }, [searchParams, inDiscord]);

  // Initializes services and logs page views.
  useEffect(() => {
    // Do not initialize services inside the Discord client or if the pixel ID is missing.
    if (inDiscord || !metaPixelId) {
      return;
    }

    // Ensure the Meta Pixel script has loaded before tracking.
    const trackView = () => {
      if (typeof window.fbq === 'function') {
        // Initialize with external_id if the user is logged in, otherwise init without it.
        const externalId = user?.uid ?? undefined;
        window.fbq('init', metaPixelId, { external_id: externalId });
        // Track PageView on initial load and subsequent route changes.
        window.fbq('track', 'PageView');
      } else {
        // If fbq is not ready, retry shortly.
        setTimeout(trackView, 200);
      }
    };

    trackView();

    // Defer the initialization of Firebase services to prevent blocking the main thread.
    const timer = setTimeout(() => {
      const initializeFirebaseServices = async () => {
        try {
          // Initialize Performance Monitoring.
          const { getFirebasePerformance } = await import('@/lib/firebase/firebase');
          getFirebasePerformance();

          // Initialize and use Analytics.
          const { getFirebaseAnalytics } = await import('@/lib/firebase/firebase');
          const analytics = await getFirebaseAnalytics();
          if (analytics) {
            const { logEvent } = await import('firebase/analytics');
            logEvent(analytics, 'page_view', { page_path: pathname });
          }
        } catch {
          // Silently fail on non-critical analytics errors.
        }
      };
      initializeFirebaseServices();
    }, 2000);

    return () => clearTimeout(timer);
  }, [pathname, inDiscord, metaPixelId, user]);

  // Render the Meta Pixel script if not inside Discord.
  if (inDiscord || !metaPixelId) {
    return null;
  }

  return (
    <Script id="fb-pixel-script" strategy="afterInteractive">
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
      `}
    </Script>
  );
});

AnalyticsTracker.displayName = 'AnalyticsTracker';

export { AnalyticsTracker };