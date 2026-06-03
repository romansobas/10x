import { it, expect } from "vitest";
import { createTestUser, deleteTestUser } from "./helpers";

it("test infrastructure: createTestUser and deleteTestUser work correctly", async () => {
  const user = await createTestUser("smoke");
  expect(user.userId).toBeTruthy();
  expect(user.client).toBeTruthy();
  await deleteTestUser(user.userId);
});
