// Optional Supabase support
export const Leaderboard = {
  enabled: false,
  client: null,

  SUPABASE_URL: "https://dnyibstgahnjbkjokuxs.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_1PLhDg4aoFucc0-7qWH0KA_unYKueat",
  TABLE: "neon_racer_scores",

  async init() {
    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
      this.client = mod.createClient(this.SUPABASE_URL, this.SUPABASE_ANON_KEY);
      this.enabled = true;
      return true;
    } catch {
      this.enabled = false;
      return false;
    }
  },

  async top(limit = 10) {
    if (!this.enabled || !this.client) return [];
    const { data, error } = await this.client
      .from(this.TABLE)
      .select("name, score, coins, created_at")
      .order("score", { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  },

  async submit({ name, score, coins }) {
    if (!this.enabled || !this.client) throw new Error("Leaderboard disabled");

    // mild client-side sanity checks (DB rules are better, but this helps)
    const safeName = String(name || "Gamer").slice(0, 18);
    const safeScore = Math.max(0, Math.min(2_000_000_000, Number(score) | 0));
    const safeCoins = Math.max(0, Math.min(2_000_000_000, Number(coins) | 0));

    const { error } = await this.client.from(this.TABLE).insert([{
      name: safeName,
      score: safeScore,
      coins: safeCoins,
      created_at: new Date().toISOString()
    }]);

    if (error) throw error;
    return true;
  }
};
