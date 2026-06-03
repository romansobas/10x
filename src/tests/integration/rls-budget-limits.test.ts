import { describe, beforeAll, afterAll, it, expect } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";
import { upsertBudgetLimit, deleteBudgetLimit } from "@/lib/services/budget-limits";

describe("budget_limits RLS isolation", () => {
  let userA: TestUser;
  let userB: TestUser;
  let catAId: string;
  let limitAId: string;

  beforeAll(async () => {
    userA = await createTestUser("bl-a");
    userB = await createTestUser("bl-b");

    const { data: catData, error: catError } = await userA.client
      .from("categories")
      .insert({ name: "Budget Test Category", user_id: userA.userId })
      .select("id")
      .single();
    if (catError) throw catError;
    if (!catData) throw new Error("No data returned from category insert");
    catAId = catData.id;

    const { data: limitData, error: limitError } = await userA.client
      .from("budget_limits")
      .insert({ user_id: userA.userId, category_id: catAId, monthly_limit: 100 })
      .select("id")
      .single();
    if (limitError) throw limitError;
    if (!limitData) throw new Error("No data returned from budget_limit insert");
    limitAId = limitData.id;
  });

  afterAll(async () => {
    await deleteTestUser(userA.userId);
    await deleteTestUser(userB.userId);
  });

  it("SELECT: User B cannot see User A budget limits", async () => {
    const { data, error } = await userB.client.from("budget_limits").select("id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).not.toContain(limitAId);
  });

  it("INSERT: User B cannot insert a row claiming User A user_id", async () => {
    const { error } = await userB.client.from("budget_limits").insert({
      user_id: userA.userId,
      category_id: catAId,
      monthly_limit: 50,
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("UPDATE: User B cannot update User A budget limit", async () => {
    const { error } = await userB.client
      .from("budget_limits")
      .update({ monthly_limit: 999 })
      .eq("id", limitAId);
    expect(error).toBeNull();
    const { data } = await userA.client
      .from("budget_limits")
      .select("monthly_limit")
      .eq("id", limitAId)
      .single();
    expect(data?.monthly_limit).toBe(100);
  });

  it("DELETE (direct): User B cannot delete User A budget limit", async () => {
    const { error } = await userB.client.from("budget_limits").delete().eq("id", limitAId);
    expect(error).toBeNull();
    const { data } = await userA.client.from("budget_limits").select("id").eq("id", limitAId).single();
    expect(data).not.toBeNull();
  });

  it("UPSERT IDOR (service): User B upsert on User A category does not modify User A limit", async () => {
    // upsertBudgetLimit inserts { user_id: userBId, category_id: catAId } — a new row for userB.
    // It cannot affect userA's existing limit because the unique constraint is (user_id, category_id).
    await upsertBudgetLimit(userB.client, userB.userId, catAId, 999);
    const { data } = await userA.client
      .from("budget_limits")
      .select("monthly_limit")
      .eq("id", limitAId)
      .single();
    expect(data?.monthly_limit).toBe(100);
  });

  it("DELETE IDOR (service): User B cannot delete User A budget limit via service function", async () => {
    await deleteBudgetLimit(userB.client, userB.userId, catAId);
    const { data } = await userA.client.from("budget_limits").select("id").eq("id", limitAId).single();
    expect(data).not.toBeNull();
  });
});
