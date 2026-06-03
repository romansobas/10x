import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var for integration tests: ${key}`);
  return value;
}

const adminClient = createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface TestUser {
  userId: string;
  client: SupabaseClient<Database>;
}

export async function createTestUser(suffix: string): Promise<TestUser> {
  const url = getRequiredEnv("SUPABASE_URL");
  const anonKey = getRequiredEnv("SUPABASE_ANON_KEY");
  const email = `rls-${suffix}@test.local`;
  const password = "TestPassword123!";

  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  if (!createData.user) throw new Error(`createUser returned no user for ${email}`);

  try {
    const anonClientForSignIn = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInError } = await anonClientForSignIn.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;
    if (!signInData.session) throw new Error(`signInWithPassword returned no session for ${email}`);

    const authenticatedClient = createClient<Database>(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    return { userId: createData.user.id, client: authenticatedClient };
  } catch (err) {
    // Clean up the auth user so the same email can be used on the next run.
    await adminClient.auth.admin.deleteUser(createData.user.id).catch(() => undefined);
    throw err;
  }
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) throw error;
}
