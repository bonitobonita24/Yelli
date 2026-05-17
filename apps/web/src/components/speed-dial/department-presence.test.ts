import { describe, expect, it } from "vitest";

import {
  extractBoundUserIds,
  selectDepartmentPresence,
  type DepartmentBinding,
} from "./department-presence";

describe("extractBoundUserIds", () => {
  it("returns empty array for empty input", () => {
    expect(extractBoundUserIds([])).toEqual([]);
  });

  it("returns only non-null default_user_id values", () => {
    const depts: DepartmentBinding[] = [
      { id: "d1", default_user_id: "u1" },
      { id: "d2", default_user_id: null },
      { id: "d3", default_user_id: "u3" },
    ];
    expect(extractBoundUserIds(depts)).toEqual(["u1", "u3"]);
  });

  it("preserves order matching the input department order", () => {
    const depts: DepartmentBinding[] = [
      { id: "d1", default_user_id: "u-late" },
      { id: "d2", default_user_id: "u-early" },
    ];
    expect(extractBoundUserIds(depts)).toEqual(["u-late", "u-early"]);
  });

  it("does NOT deduplicate (caller responsibility if needed)", () => {
    const depts: DepartmentBinding[] = [
      { id: "d1", default_user_id: "u1" },
      { id: "d2", default_user_id: "u1" },
    ];
    expect(extractBoundUserIds(depts)).toEqual(["u1", "u1"]);
  });
});

describe("selectDepartmentPresence", () => {
  it("returns 'online' when bound user is online and not in_call", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, { u1: true }, new Set())).toBe(
      "online",
    );
  });

  it("returns 'offline' when bound user is offline", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, { u1: false }, new Set())).toBe(
      "offline",
    );
  });

  it("returns 'offline' when bound user missing from presence map", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, {}, new Set())).toBe("offline");
  });

  it("returns 'offline' when default_user_id is null (unbound)", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: null };
    expect(selectDepartmentPresence(dept, { u1: true }, new Set())).toBe(
      "offline",
    );
  });

  it("treats undefined presence entry as offline (no crash)", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u-unknown" };
    expect(selectDepartmentPresence(dept, { u1: true }, new Set())).toBe(
      "offline",
    );
  });

  it("returns 'in_call' when bound user is in the inCall set", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, {}, new Set(["u1"]))).toBe("in_call");
  });

  it("returns 'in_call' (precedence wins) when bound user is BOTH online and in_call", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(
      selectDepartmentPresence(dept, { u1: true }, new Set(["u1"])),
    ).toBe("in_call");
  });

  it("returns 'in_call' even when online map says offline (transitional window)", () => {
    // Edge case: server-side in-call roster still has the user but the
    // online-presence engine already cleaned up (e.g. socket dropped before
    // call:left fired). in_call is authoritative per locked decision 3.
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(
      selectDepartmentPresence(dept, { u1: false }, new Set(["u1"])),
    ).toBe("in_call");
  });

  it("returns 'offline' when default_user_id is null even if a matching id is in inCall set", () => {
    // Unbound dept: null FK always wins as offline. inCall.has check is gated
    // by the null check.
    const dept: DepartmentBinding = { id: "d1", default_user_id: null };
    expect(selectDepartmentPresence(dept, {}, new Set(["u1"]))).toBe(
      "offline",
    );
  });
});
