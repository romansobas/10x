import { describe, beforeAll, afterAll, it, expect } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";
import { deleteExpense } from "@/lib/services/expenses";

describe("expenses RLS isolation", () => {
  let userA: TestUser;
  let userB: TestUser;
  let catAId: string;
  let expAId: string;

  beforeAll(async () => {
    userA = await createTestUser("exp-a");
    userB = await createTestUser("exp-b");

    const { data: catData, error: catError } = await userA.client
      .from("categories")
      .insert({ name: "Expense Test Category", user_id: userA.userId })
      .select("id")
      .single();
    if (catError) throw catError;
    if (!catData) throw new Error("No data returned from category insert");
    catAId = catData.id;

    const { data: expData, error: expError } = await userA.client
      .from("expenses")
      .insert({ user_id: userA.userId, category_id: catAId, amount: 50, expense_date: "2026-06-01" })
      .select("id")
      .single();
    if (expError) throw expError;
    if (!expData) throw new Error("No data returned from expense insert");
    expAId = expData.id;
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(userA.userId), deleteTestUser(userB.userId)]);
  });

  it("SELECT: User B cannot see User A expenses", async () => {
    const { data, error } = await userB.client.from("expenses").select("id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).not.toContain(expAId);
  });

  it("INSERT: User B cannot insert a row claiming User A user_id", async () => {
    const { error } = await userB.client.from("expenses").insert({
      user_id: userA.userId,
      category_id: catAId,
      amount: 1,
      expense_date: "2026-06-01",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("UPDATE: User B cannot update User A expense", async () => {
    const { error } = await userB.client.from("expenses").update({ amount: 999 }).eq("id", expAId);
    expect(error).toBeNull();
    const { data, error: reReadError } = await userA.client.from("expenses").select("amount").eq("id", expAId).single();
    expect(reReadError).toBeNull();
    expect(Number(data?.amount)).toBe(50);
  });

  it("DELETE (direct): User B cannot delete User A expense", async () => {
    const { error } = await userB.client.from("expenses").delete().eq("id", expAId);
    expect(error).toBeNull();
    const { data } = await userA.client.from("expenses").select("id").eq("id", expAId).single();
    expect(data).not.toBeNull();
  });

  it("DELETE IDOR (service): User B cannot delete User A expense via service function", async () => {
    await deleteExpense(userB.client, userB.userId, expAId);
    const { data } = await userA.client.from("expenses").select("id").eq("id", expAId).single();
    expect(data).not.toBeNull();
  });
});
