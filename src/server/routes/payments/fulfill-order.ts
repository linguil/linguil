import { Hono } from 'hono';
import type { Context as HonoContext } from 'hono';
import { restUpdateDoc } from '@/server/lib/firestore-rest';
import type { PaymentHandlerResponse } from '@devvit/web/server';
import type { Order } from '@devvit/web/shared';
import { settings } from '@devvit/web/server';

const LINGUIL_PLUS_SKU = "linguil_plus";

// Create a more specific type for the order payload to work around limitations in the official Devvit type definitions.
// The official `Order` type is missing `userId` and uses an un-exported `status` enum.
type FulfillmentOrder = Omit<Order, 'status'> & {
  status: string;
  userId: string;
};

// Adds the route for fulfilling a paid order.
export const addFulfillOrderRoute = (app: Hono) => {
  app.post('/internal/payments/fulfill', async (c: HonoContext) => {
    try {
      const order = await c.req.json<FulfillmentOrder>();

      // Ensure the order has been paid for before fulfilling.
      if (order.status !== "PAID") {
        return c.json<PaymentHandlerResponse>({
          success: false,
          reason: "Order has not been paid.",
        });
      }

      // Verify that the order includes the correct product SKU.
      if (!order.products.some((p) => p.sku === LINGUIL_PLUS_SKU)) {
        return c.json<PaymentHandlerResponse>({
          success: false,
          reason: `Unable to fulfill order: SKU ${LINGUIL_PLUS_SKU} not found.`,
        });
      }

      // Update the user's document to grant them paid status.
      await restUpdateDoc(`users/${order.userId}`, { hasPaid: true });

      // Forward the order to the Reddit Gold webhook for recording.
      const redditGoldWebhookUrl = await settings.get('NEXT_PUBLIC_FIREBASE_REDDIT_GOLD_WEBHOOK_URL');
      const writeSecret = await settings.get('FIRESTORE_WRITE_SECRET');
      if (typeof redditGoldWebhookUrl === 'string' && typeof writeSecret === 'string') {
        await fetch(redditGoldWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-proxy-api-key': writeSecret,
          },
          body: JSON.stringify(order),
        });
      }

      return c.json<PaymentHandlerResponse>({ success: true });

    } catch (error) {
      console.error('[Fulfill Order]: An unexpected error occurred:', error);
      return c.json<PaymentHandlerResponse>({
        success: false,
        reason: 'Internal server error during fulfillment.',
      });
    }
  });
};