// Live Oura reads with real diagnostics: an expired token and an unsynced
// ring are different problems and get reported as such.
export type OuraSnapshot = {
  status: "ok" | "no_token" | "unauthorized" | "no_data" | "error";
  summary: string | null;
};

function etDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function ouraSnapshot(): Promise<OuraSnapshot> {
  const token = process.env.OURA_TOKEN;
  if (!token) return { status: "no_token", summary: null };
  const today = etDate();
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const [r, s] = await Promise.all([
      fetch(
        `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${today}&end_date=${today}`,
        { headers, cache: "no-store" }
      ),
      fetch(
        `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${today}&end_date=${today}`,
        { headers, cache: "no-store" }
      ),
    ]);
    if (r.status === 401 || s.status === 401)
      return { status: "unauthorized", summary: null };
    const rj = r.ok ? await r.json() : null;
    const sj = s.ok ? await s.json() : null;
    const rd = rj?.data?.[0];
    const sl = sj?.data?.[0];
    if (!rd && !sl) return { status: "no_data", summary: null };
    const parts: string[] = [];
    if (rd?.score) parts.push(`readiness ${rd.score}`);
    if (rd?.contributors?.hrv_balance)
      parts.push(`HRV balance ${rd.contributors.hrv_balance}`);
    if (rd?.contributors?.resting_heart_rate)
      parts.push(`RHR contributor ${rd.contributors.resting_heart_rate}`);
    if (rd?.temperature_deviation != null)
      parts.push(`temp deviation ${rd.temperature_deviation}°C`);
    if (sl?.score) parts.push(`sleep ${sl.score}`);
    return { status: "ok", summary: parts.join(", ") };
  } catch {
    return { status: "error", summary: null };
  }
}

// Coach-facing text for the get_readiness tool
export function describeSnapshot(s: OuraSnapshot): string {
  switch (s.status) {
    case "ok":
      return `Live Oura today: ${s.summary}.`;
    case "unauthorized":
      return "Oura API returned 401: the access token has expired or been revoked. Tell Laurence plainly that the Oura token needs renewing (Oura web -> personal access tokens) and that you cannot see today's data until then.";
    case "no_data":
      return "Oura token is valid but no readiness/sleep record exists for today yet - his ring probably has not synced this morning. Say so; do not guess numbers.";
    case "no_token":
      return "No OURA_TOKEN is configured on the server.";
    default:
      return "Oura API request failed (network or server error). Say the data is unavailable right now.";
  }
}
