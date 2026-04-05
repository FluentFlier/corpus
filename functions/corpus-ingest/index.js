import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-corpus-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      projectSlug,
      scanType = "full",
      nodes = [],
      edges = [],
      stats = {},
      violations = [],
    } = body;

    if (!projectSlug) {
      return new Response(
        JSON.stringify({ error: "missing_project_slug" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: scan, error: scanError } = await supabase
      .from("corpus_scans")
      .insert({
        project_slug: projectSlug,
        scan_type: scanType,
        total_files: stats.totalFiles ?? 0,
        total_functions: stats.totalFunctions ?? 0,
        health_score: stats.healthScore ?? 100,
        findings_count: violations.length,
        graph_nodes: nodes.length,
        graph_edges: edges.length,
      })
      .select("id")
      .single();

    if (scanError) {
      return new Response(
        JSON.stringify({ error: "scan_insert_failed", details: scanError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (violations.length > 0) {
      const violationRows = violations.map((v) => ({
        project_slug: projectSlug,
        file_path: v.filePath ?? v.file_path ?? "",
        function_name: v.functionName ?? v.function_name ?? null,
        violation_type: v.violationType ?? v.violation_type ?? "unknown",
        severity: v.severity ?? "warning",
        message: v.message ?? "",
        fix_suggestion: v.fixSuggestion ?? v.fix_suggestion ?? null,
        resolved: false,
      }));

      await supabase.from("corpus_violations").insert(violationRows);
    }

    if (nodes.length > 0) {
      const memoryRows = nodes.slice(0, 500).map((n) => ({
        project_slug: projectSlug,
        memory_type: "graph_node",
        content: JSON.stringify(n),
        file_path: n.file ?? null,
        function_name: n.name ?? null,
        flag_count: 0,
        metadata: {
          type: n.type,
          health: n.health,
          exported: n.exported,
          scan_id: scan.id,
        },
      }));

      await supabase.from("corpus_memory").insert(memoryRows);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanId: scan.id,
        nodesIngested: nodes.length,
        edgesIngested: edges.length,
        violationsIngested: violations.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
