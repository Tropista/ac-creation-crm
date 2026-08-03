/**
 * Point d'accès Supabase générique partagé par les repositories spécialisés.
 * Il centralise les requêtes sans exposer Supabase aux composants React.
 */
export class SupabaseRepository {
  constructor(client) {
    if (!client) throw new Error("SUPABASE_CLIENT_REQUIRED");
    this.client = client;
  }

  async findById(table, id, select = "*") {
    const { data, error } = await this.client
      .from(table)
      .select(select)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async upsert(table, payload, options = { onConflict: "id" }) {
    const { data, error } = await this.client
      .from(table)
      .upsert(payload, options)
      .select();
    if (error) throw error;
    return data;
  }

  async remove(table, id) {
    const { error } = await this.client.from(table).delete().eq("id", id);
    if (error) throw error;
  }
}
