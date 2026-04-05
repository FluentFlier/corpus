import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase-server';

const MAX_BODY_BYTES = 65536;
const RATE_LIMIT_PER_MINUTE = 300;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const ActionLogSchema = z.object({
  id: z.string().uuid(),
  projectSlug: z.string().min(1).max(64),
  actionType: z.string().min(1).max(256),
  verdict: z.enum(['PASS', 'BLOCK', 'CONFIRM']),
  userDecision: z.enum(['CONFIRMED', 'CANCELLED']).nullable().optional(),
  policyTriggered: z.string().min(1).max(128),
  blockReason: z.string().max(64).nullable().optional(),
  durationMs: z.number().int().min(0),
  timestamp: z.string(),
  // Optional violations array for InsForge corpus_violations ingestion
  violations: z.array(z.object({
    filePath: z.string().min(1),
    functionName: z.string().optional(),
    violationType: z.string().min(1),
    severity: z.enum(['error', 'warning', 'info']),
    message: z.string().min(1),
    fixSuggestion: z.string().optional(),
  })).optional(),
});

function safeCompare(a: string, b: string): boolean {
  // Hash both to fixed length to avoid leaking key length via timing
  const { createHash } = require('crypto') as typeof import('crypto');
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();

  // Prune expired entries when the map grows too large
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap) {
      if (now > v.resetAt) {
        rateLimitMap.delete(k);
      }
    }
  }

  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (entry.count >= RATE_LIMIT_PER_MINUTE) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ingestKey = process.env.CORPUS_INGEST_KEY;
  if (!ingestKey) {
    return NextResponse.json({ ok: false, error: 'service_unavailable', message: 'CORPUS_INGEST_KEY not configured' }, { status: 503 });
  }

  // Validate API key with constant-time comparison
  const apiKey = req.headers.get('x-corpus-key') ?? '';
  if (!safeCompare(apiKey, ingestKey)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Content-Type check
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ ok: false, error: 'invalid_content_type' }, { status: 415 });
  }

  // Rate limit per API key
  if (!checkRateLimit(apiKey)) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  // Body size limit (header-based check + actual body enforcement below)
  const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  }

  try {
    // Enforce actual body size (not just Content-Length header)
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
    }
    const body = JSON.parse(rawBody);
    const parsed = ActionLogSchema.parse(body);

    // Upsert project
    const { data: project, error: projectError } = await supabaseAdmin
      .from('corpus_projects')
      .upsert(
        { slug: parsed.projectSlug, name: parsed.projectSlug },
        { onConflict: 'slug' }
      )
      .select('id')
      .single();

    if (projectError || !project) {
      return NextResponse.json({ ok: false, error: 'project_upsert_failed' });
    }

    // Insert log entry (no actionPayload - only behavioral metadata)
    const { error: insertError } = await supabaseAdmin
      .from('corpus_action_logs')
      .insert({
        id: parsed.id,
        project_id: project.id,
        action_type: parsed.actionType,
        verdict: parsed.verdict,
        user_decision: parsed.userDecision ?? null,
        policy_triggered: parsed.policyTriggered,
        block_reason: parsed.blockReason ?? null,
        duration_ms: parsed.durationMs,
      });

    if (insertError) {
      return NextResponse.json({ ok: false, error: 'insert_failed' });
    }

    // Insert violations into corpus_violations table if provided
    let violationsInserted = 0;
    if (parsed.violations && parsed.violations.length > 0) {
      const violationRows = parsed.violations.map((v) => ({
        project_slug: parsed.projectSlug,
        file_path: v.filePath,
        function_name: v.functionName ?? null,
        violation_type: v.violationType,
        severity: v.severity,
        message: v.message,
        fix_suggestion: v.fixSuggestion ?? null,
        resolved: false,
      }));

      const { error: violationsError } = await supabaseAdmin
        .from('corpus_violations')
        .insert(violationRows);

      if (!violationsError) {
        violationsInserted = violationRows.length;
      }
    }

    return NextResponse.json({ ok: true, violationsInserted });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' });
  }
}
