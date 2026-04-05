import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';

const DASHBOARD_FILE = '/tmp/corpus-dashboard.json';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const raw = readFileSync(DASHBOARD_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      {
        score: 100,
        filesScanned: 0,
        issues: { critical: 0, warning: 0, info: 0 },
        events: [],
        uptime: '0s',
        lastUpdate: null,
        status: 'waiting',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
