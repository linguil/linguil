import { settings } from '@devvit/web/server';

export function toFirestoreValue(value: any): Record<string, any> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((v) => toFirestoreValue(v)),
      },
    };
  }
  if (typeof value === 'object') {
    const fields: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      fields[key] = toFirestoreValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

export function fromFirestoreValue(firestoreValue: Record<string, any>): any {
  if ('nullValue' in firestoreValue) return null;
  if ('booleanValue' in firestoreValue) return firestoreValue.booleanValue;
  if ('doubleValue' in firestoreValue) return Number(firestoreValue.doubleValue);
  if ('integerValue' in firestoreValue) return Number(firestoreValue.integerValue);
  if ('stringValue' in firestoreValue) return firestoreValue.stringValue;
  if ('timestampValue' in firestoreValue) return new Date(firestoreValue.timestampValue);
  if ('arrayValue' in firestoreValue) {
    return (firestoreValue.arrayValue.values || []).map((v: any) => fromFirestoreValue(v));
  }
  if ('mapValue' in firestoreValue) {
    const obj: Record<string, any> = {};
    const fields = firestoreValue.mapValue.fields || {};
    for (const [key, val] of Object.entries(fields)) {
      obj[key] = fromFirestoreValue(val as Record<string, any>);
    }
    return obj;
  }
  return firestoreValue;
}

export function getSessionDocPath(sessionId: string): string {
  return `_auth_sessions/${sessionId}`;
}

async function getFirestoreConfig() {
  const apiKey = await settings.get('NEXT_PUBLIC_FIREBASE_API_KEY');
  const projectId = await settings.get('NEXT_PUBLIC_FIREBASE_PROJECT_ID');

  if (typeof apiKey !== 'string' || !apiKey) {
    throw new Error('Firestore configuration missing: NEXT_PUBLIC_FIREBASE_API_KEY');
  }
  if (typeof projectId !== 'string' || !projectId) {
    throw new Error('Firestore configuration missing: NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  }

  return { apiKey, projectId };
}

async function fetchFirestore(path: string, options: RequestInit = {}) {
  const { apiKey } = await getFirestoreConfig();
  const url = 'https://us-central1-linguil.cloudfunctions.net/firestoreProxy';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-api-key': apiKey,
    },
    body: JSON.stringify({
      path,
      options,
    }),
  });

  if (!response.ok) {
    if (response.status === 404 && options.method === 'GET') {
        throw new Error('Document not found');
    }
    const error = await response.json();
    throw new Error(`Firestore Proxy Error: ${JSON.stringify(error)}`);
  }

  return response.json();
}

export async function restGetDoc(docPath: string): Promise<any> {
  try {
    const data = await fetchFirestore(docPath, { method: 'GET' });
    if (!data.fields) return null;
    const fields = data.fields || {};
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(fields)) {
      result[key] = fromFirestoreValue(val as Record<string, any>);
    }
    return result;
  } catch (_e) {
    return null;
  }
}

export async function restCreateDoc(collectionPath: string, documentId: string, data: any): Promise<void> {
    const fields: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
        fields[key] = toFirestoreValue(val);
    }

    await fetchFirestore(`${collectionPath}?documentId=${documentId}`, {
        method: 'POST',
        body: JSON.stringify({ fields }),
    });
}

export async function restSetDoc(docPath: string, data: any): Promise<void> {
  const fields: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
  }

  await fetchFirestore(docPath, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

export async function restUpdateDoc(docPath: string, data: any): Promise<void> {
  const fields: Record<string, any> = {};
  const updateMask: string[] = [];

  for (const [key, val] of Object.entries(data)) {
    fields[key] = toFirestoreValue(val);
    updateMask.push(key);
  }

  const queryParams = updateMask.map(f => `updateMask.fieldPaths=${f}`).join('&');
  await fetchFirestore(`${docPath}?${queryParams}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

export async function restCommit(writes: any[]): Promise<void> {
    await fetchFirestore(':commit', {
        method: 'POST',
        body: JSON.stringify({ writes }),
    });
}

export async function restQuery(collectionId: string, constraints: any): Promise<any[]> {
  const url = `:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      ...constraints
    }
  };

  const results = await fetchFirestore(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!Array.isArray(results)) return [];

  return results
    .filter((r: any) => r.document)
    .map((r: any) => {
      const docName = r.document.name;
      const id = docName.split('/').pop();
      const fields = r.document.fields || {};
      const obj: Record<string, any> = {};
      for (const [key, val] of Object.entries(fields)) {
        obj[key] = fromFirestoreValue(val as Record<string, any>);
      }
      return { _id: id, uid: id, ...obj };
    });
}