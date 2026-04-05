import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { email } = await req.json() as { email: string };

    if (!email || !email.includes('@')) {
      return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('corpus_waitlist')
      .upsert(
        { email: email.toLowerCase().trim() },
        { onConflict: 'email' }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
}
