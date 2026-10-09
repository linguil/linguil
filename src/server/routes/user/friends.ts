import type { Hono, Context } from 'hono';
import { restGetDoc, restQuery } from '@/server/lib/firestore-rest';

// Route handler for fetching leaderboard data for the current user and their friends in Devvit.
export const addFriendsRoute = (app: Hono) => {
  app.get('/api/user/friends', async (c: Context) => {
    try {
      const uid = c.get('uid'); // UID is set by the verifyToken middleware.
      if (!uid) return c.json({ message: "Unauthorized" }, 401);

      // 1. Get the user's private document to find their list of friend UIDs.
      const userDoc = await restGetDoc(`users/${uid}`);
      if (!userDoc) {
        return c.json({ message: 'User not found' }, 404);
      }

      const friendUids = userDoc.friends || [];
      // Create a unique list of UIDs including the user themselves.
      const allUids = Array.from(new Set([uid, ...friendUids]));

      if (allUids.length === 0) {
        return c.json([]);
      }

      // 2. Fetch the public data for all UIDs in batch queries of up to 30.
      const MAX_IN = 30;
      const chunks: string[][] = [];
      for (let i = 0; i < allUids.length; i += MAX_IN) {
        chunks.push(allUids.slice(i, i + MAX_IN));
      }

      const chunkResults = await Promise.all(
        chunks.map(chunk =>
          restQuery('users_public', {
            where: {
              fieldFilter: {
                field: { fieldPath: '__name__' },
                op: 'IN',
                value: { arrayValue: { values: chunk.map(id => ({ referenceValue: `users_public/${id}` })) } },
              },
            },
          })
        )
      );

      const playersData = chunkResults.flat().map((p: any) => ({
        uid: p.uid || p._id,
        ...p,
      }));

      return c.json(playersData);
    } catch (error: any) {
      console.error('Fetch friends data error:', error, error.response?.data);
      return c.json({ message: 'Internal Server Error' }, 500);
    }
  });
};