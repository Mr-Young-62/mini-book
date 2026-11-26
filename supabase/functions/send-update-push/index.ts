// Supabase Edge Function: send-update-push
// Sends a Web Push notification to every subscribed browser (iOS PWA / web).
// Called by GitHub Actions after a release tag publishes the APK manifest.
// Auth: shared secret in the Authorization header (UPDATE_PUSH_SECRET).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webPush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

interface PushBody {
  version?: unknown;
  notes?: unknown;
  url?: unknown;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time-ish secret comparison (length is not secret for this use).
function secretsMatch(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(provided);
  const b = encoder.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const secret = Deno.env.get("UPDATE_PUSH_SECRET");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!secret || !vapidPublic || !vapidPrivate) {
    return jsonResponse(500, { error: "missing_server_configuration" });
  }

  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ") || !secretsMatch(authorization.slice(7), secret)) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  let body: PushBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const version = typeof body.version === "string" ? body.version.trim() : "";
  if (!/^\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?$/.test(version)) {
    return jsonResponse(400, { error: "invalid_version" });
  }
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : "";
  const url = typeof body.url === "string" && body.url.startsWith("/") ? body.url : "/";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");
  if (error) {
    return jsonResponse(500, { error: "subscription_read_failed", detail: error.message });
  }

  let subject = Deno.env.get("VAPID_SUBJECT");
  if (!subject) {
    try {
      subject = `mailto:admin@${new URL(supabaseUrl).hostname}`;
    } catch {
      subject = "mailto:admin@localhost";
    }
  }
  webPush.setVapidDetails(subject, vapidPublic, vapidPrivate);

  const payload = JSON.stringify({
    title: "MeelieFont",
    body: notes ? `Versi ${version} tersedia. ${notes}` : `Versi ${version} tersedia.`,
    url,
  });

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  await Promise.all((subscriptions ?? []).map(async (subscription) => {
    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
      sent += 1;
    } catch (sendError) {
      const statusCode = (sendError as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        dead.push(subscription.id);
      } else {
        failed += 1;
      }
    }
  }));

  if (dead.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", dead);
  }

  return jsonResponse(200, { sent, failed, removed: dead.length, version });
});
