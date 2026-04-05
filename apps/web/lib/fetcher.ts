import { supabase } from './supabase';

export interface ProjectStats {
  projectId: string;
  slug: string;
  name: string;
  totalRuns: number;
  passCount: number;
  blockCount: number;
  confirmCount: number;
  confirmedCount: number;
  cancelledCount: number;
  passRate: number;
  lastRunAt: string | null;
}

export interface PolicyBreakdownEntry {
  policyTriggered: string;
  totalRuns: number;
  passCount: number;
  blockCount: number;
  confirmCount: number;
  passRate: number;
}

export interface RecentActivityEntry {
  id: string;
  actionType: string;
  verdict: string;
  policyTriggered: string;
  durationMs: number;
  createdAt: string;
  userDecision: string | null;
}

export interface ProjectData {
  project: { slug: string; name: string };
  stats: ProjectStats;
  policyBreakdown: PolicyBreakdownEntry[];
  dailyPassRate: { day: string; passRate: number; totalRuns: number }[];
  recentActivity: RecentActivityEntry[];
}

export async function fetchProjectStats(slug: string): Promise<ProjectData | null> {
  const { data: stats, error: statsError } = await supabase
    .from('corpus_project_stats')
    .select('*')
    .eq('slug', slug)
    .single();

  if (statsError || !stats) return null;

  const { data: breakdown } = await supabase
    .from('corpus_policy_breakdown')
    .select('*')
    .eq('project_id', stats.project_id);

  const { data: daily } = await supabase
    .from('corpus_daily_pass_rate')
    .select('*')
    .eq('project_id', stats.project_id)
    .order('day', { ascending: true });

  const { data: activity } = await supabase
    .from('corpus_action_logs')
    .select('id, action_type, verdict, policy_triggered, duration_ms, created_at, user_decision')
    .eq('project_id', stats.project_id)
    .order('created_at', { ascending: false })
    .limit(25);

  return {
    project: { slug: stats.slug, name: stats.name },
    stats: {
      projectId: stats.project_id,
      slug: stats.slug,
      name: stats.name,
      totalRuns: Number(stats.total_runs),
      passCount: Number(stats.pass_count),
      blockCount: Number(stats.block_count),
      confirmCount: Number(stats.confirm_count),
      confirmedCount: Number(stats.confirmed_count),
      cancelledCount: Number(stats.cancelled_count),
      passRate: Number(stats.pass_rate) || 0,
      lastRunAt: stats.last_run_at,
    },
    policyBreakdown: (breakdown ?? []).map((b: Record<string, unknown>) => ({
      policyTriggered: b.policy_triggered as string,
      totalRuns: Number(b.total_runs),
      passCount: Number(b.pass_count),
      blockCount: Number(b.block_count),
      confirmCount: Number(b.confirm_count),
      passRate: Number(b.pass_rate) || 0,
    })),
    dailyPassRate: (daily ?? []).map((d: Record<string, unknown>) => ({
      day: String(d.day),
      passRate: Number(d.pass_rate) || 0,
      totalRuns: Number(d.total_runs),
    })),
    recentActivity: (activity ?? []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      actionType: a.action_type as string,
      verdict: a.verdict as string,
      policyTriggered: a.policy_triggered as string,
      durationMs: Number(a.duration_ms),
      createdAt: a.created_at as string,
      userDecision: (a.user_decision as string) ?? null,
    })),
  };
}
