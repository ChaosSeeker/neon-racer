// Optional Supabase support (only if you add your keys)
// If not configured, UI will show "Leaderboard coming soon".

export const Leaderboard = {
  enabled: true,
  client: null,

  // Fill these to enable
  SUPABASE_URL: "https://dnyibstgahnjbkjokuxs.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_1PLhDg4aoFucc0-7qWH0KA_unYKueat",
  TABLE: "neon_racer_scores",

  async init() {
    if (!this.SUPABASE_URL || !this.SUPABASE_ANON_KEY) {
      this.enabled = false;
      return false;
    }
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    this.client = createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY);
    this.enabled = true;
    return true;
  },

  async top(limit = 10) {
    if (!this.enabled) return [];
    const { data, error } = await this.client
      .from(this.TABLE)
      .select("name, score, coins, created_at")
      .order("score", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async submit({ name, score, coins }) {
    if (!this.enabled) return false;
    const cleanName = (name || "Player").trim().slice(0, 16) || "Player";
    const payload = { name: cleanName, score: Math.floor(score), coins: Math.floor(coins) };
    const { error } = await this.client.from(this.TABLE).insert(payload);
    if (error) throw error;
    return true;
  }
};
