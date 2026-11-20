import { describe, expect, it } from "vitest";
import { adminUpdateSchema, createUserSchema } from "../src/server/validation";

describe("allowedRooms validation", () => {
  it("accepts * (all rooms) on update, e.g. a role change that resends the room list", () => {
    const r = adminUpdateSchema.safeParse({ role: "admin", allowedRooms: ["*"] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.allowedRooms).toEqual(["*"]);
  });

  it("collapses a list containing * to [*]", () => {
    const r = adminUpdateSchema.safeParse({ allowedRooms: ["mensa", "*"] });
    expect(r.success && r.data.allowedRooms).toEqual(["*"]);
  });

  it("accepts explicit * on create", () => {
    const r = createUserSchema.safeParse({ username: "abc", displayname: "A", password: "x", allowedRooms: ["*"] });
    expect(r.success).toBe(true);
  });

  it("still rejects invalid room names", () => {
    for (const room of ["a*b", "**", "foo bar", "../x", ""]) {
      expect(adminUpdateSchema.safeParse({ allowedRooms: [room] }).success).toBe(false);
    }
  });
});
