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
  it("returns 'online' when bound user is online", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, { u1: true })).toBe("online");
  });

  it("returns 'offline' when bound user is offline", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, { u1: false })).toBe("offline");
  });

  it("returns 'offline' when bound user missing from presence map", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u1" };
    expect(selectDepartmentPresence(dept, {})).toBe("offline");
  });

  it("returns 'offline' when default_user_id is null (unbound)", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: null };
    expect(selectDepartmentPresence(dept, { u1: true })).toBe("offline");
  });

  it("treats undefined presence entry as offline (no crash)", () => {
    const dept: DepartmentBinding = { id: "d1", default_user_id: "u-unknown" };
    expect(selectDepartmentPresence(dept, { u1: true })).toBe("offline");
  });
});
