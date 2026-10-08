import { expect, test } from "vitest";
import { AuthApiError, AuthRetryableFetchError, type UserResponse } from "@supabase/supabase-js";
import { userIdFromGetUserResult } from "../src/auth";

test("a valid token gives the user id; a bad one gives null", () => {
  expect(userIdFromGetUserResult({ data: { user: { id: "u1" } }, error: null } as unknown as UserResponse)).toBe("u1");
  expect(userIdFromGetUserResult({ data: { user: null }, error: new AuthApiError("bad jwt", 401, "bad_jwt") } as unknown as UserResponse)).toBeNull();
});

test("a network failure throws so the caller answers 502", () => {
  expect(() => userIdFromGetUserResult({ data: { user: null }, error: new AuthRetryableFetchError("down", 0) } as unknown as UserResponse)).toThrow(/Couldn't verify/);
});
