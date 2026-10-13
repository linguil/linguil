import type { Hono, Context } from 'hono';
import { telemetryRouter } from '@devvit/analytics/server/reddit';

// Bridges Devvit's Express-based telemetry router to Hono.
// Handles Devvit Journeys telemetry endpoints (/api/telemetry/journey/*).
export const addTelemetryRoutes = (app: Hono) => {
  const handler = async (c: Context) => {
    return new Promise<Response>(async (resolve) => {
      let statusCode = 200;
      const res: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          resolve(c.json(data, statusCode as any));
        },
      };

      let body: any;
      try {
        body = await c.req.json();
      } catch {
        body = {};
      }

      const parsedUrl = new URL(c.req.url);
      const req: any = {
        method: c.req.method,
        url: parsedUrl.pathname,
        headers: Object.fromEntries(c.req.raw.headers.entries()),
        body,
        complete: true,
        readable: false,
      };

      telemetryRouter.handle(req, res, (err?: any) => {
        if (err) {
          console.error('Telemetry router error:', err);
          resolve(c.json({ error: 'Internal server error' }, 500));
        } else {
          resolve(c.notFound());
        }
      });
    });
  };

  app.all('/api/telemetry', handler);
  app.all('/api/telemetry/*', handler);
};