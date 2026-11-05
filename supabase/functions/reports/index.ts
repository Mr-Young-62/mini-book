// Supabase Edge Function: reports
// Generates aggregated library inventory analytics

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Aggregate key library statistics
    const [booksRes, copiesRes, membersRes] = await Promise.all([
      supabase.from("books").select("id", { count: "exact", head: true }),
      supabase.from("book_copies").select("id, status, acquisition_price"),
      supabase.from("members").select("id, status"),
    ]);

    const totalBooks = booksRes.count || 0;
    const copies = copiesRes.data || [];
    const members = membersRes.data || [];
    const totalCopies = copies.length;
    const availableCopies = copies.filter((c: any) => c.status === "Available").length;
    const maintenanceCopies = copies.filter((c: any) => c.status === "Maintenance" || c.status === "Damaged").length;

    const totalValuation = copies.reduce((sum: number, c: any) => sum + (parseFloat(c.acquisition_price) || 0), 0);

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        summary: {
          totalTitles: totalBooks,
          totalPhysicalCopies: totalCopies,
          availableCopies,
          maintenanceCopies,
          totalMembers: members.length,
          totalValuation: Math.round(totalValuation * 100) / 100,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
