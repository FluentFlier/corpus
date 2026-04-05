import { NextRequest, NextResponse } from 'next/server';
import { fetchProjectStats } from '@/lib/fetcher';

export const revalidate = 30;

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse> {
  if (!SLUG_RE.test(params.slug)) {
    return NextResponse.json({ error: 'invalid_slug' }, { status: 400 });
  }

  const data = await fetchProjectStats(params.slug);

  if (!data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
