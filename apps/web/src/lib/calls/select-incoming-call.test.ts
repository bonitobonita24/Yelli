import { describe, expect, it } from "vitest";

import { selectIncomingCall } from "./select-incoming-call";

describe("selectIncomingCall", () => {
  it("returns false when boundDeptIds is undefined (query still loading)", () => {
    const result = selectIncomingCall({ recipientDeptId: "dept-a" }, undefined);

    expect(result).toBe(false);
  });

  it("returns false when boundDeptIds is empty (user has no binding)", () => {
    const result = selectIncomingCall({ recipientDeptId: "dept-a" }, []);

    expect(result).toBe(false);
  });

  it("returns false when recipientDeptId is not in boundDeptIds (mismatch)", () => {
    const result = selectIncomingCall(
      { recipientDeptId: "dept-b" },
      ["dept-a"],
    );

    expect(result).toBe(false);
  });

  it("returns true when recipientDeptId is one of multiple bound departments", () => {
    const result = selectIncomingCall(
      { recipientDeptId: "dept-c" },
      ["dept-a", "dept-c"],
    );

    expect(result).toBe(true);
  });
});
