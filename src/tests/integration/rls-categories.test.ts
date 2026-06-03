import { describe, beforeAll, afterAll, it, expect } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";
import { deleteCategory } from "@/lib/services/categories";

describe("categories RLS isolation", () => {
  let userA: TestUser;
  let userB: TestUser;
  let catAId: string;

  beforeAll(async () => {
    userA = await createTestUser("cat-a");
    userB = await createTestUser("cat-b");

    const { data, error } = await userA.client
      .from("categories")
      .insert({ name: "User A Category", user_id: userA.userId })
      .select("id")
      .single();
    if (error) throw error;
    if (!data) throw new Error("No data returned from category insert");
    catAId = data.id;
  });

  afterAll(async () => {
    await deleteTestUser(userA.userId);
    await deleteTestUser(userB.userId);
  });

  it("SELECT: User B cannot see User A categories", async () => {
    const { data, error } = await userB.client.from("categories").select("id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((r) => r.id);
    expect(ids).not.toContain(catAId);
  });

  it("INSERT: User B cannot insert a row claiming User A user_id", async () => {
    const { error } = await userB.client
      .from("categories")
      .insert({ name: "Attack Category", user_id: userA.userId });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("UPDATE: User B cannot update User A category", async () => {
    const { error } = await userB.client
      .from("categories")
      .update({ name: "hacked" })
      .eq("id", catAId);
    expect(error).toBeNull();
    const { data } = await userA.client.from("categories").select("name").eq("id", catAId).single();
    expect(data?.name).toBe("User A Category");
  });

  it("DELETE (direct): User B cannot delete User A category", async () => {
    const { error } = await userB.client.from("categories").delete().eq("id", catAId);
    expect(error).toBeNull();
    const { data } = await userA.client.from("categories").select("id").eq("id", catAId).single();
    expect(data).not.toBeNull();
  });

  it("DELETE IDOR (service): User B cannot delete User A category via service function", async () => {
    await deleteCategory(userB.client, userB.userId, catAId);
    const { data } = await userA.client.from("categories").select("id").eq("id", catAId).single();
    expect(data).not.toBeNull();
  });
});
