import { describe, expect, it } from "vitest";

import {
  canUpgrade,
  formatFeatureLabel,
  formatUsageMessage,
  getBannerSeverity,
  WARNING_THRESHOLD,
} from "./compute-banner-state";

describe("getBannerSeverity", () => {
  it("returns null for Infinity limit (enterprise tier)", () => {
    expect(getBannerSeverity(9999, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("returns null for non-positive limit (capability feature)", () => {
    expect(getBannerSeverity(0, 0)).toBeNull();
    expect(getBannerSeverity(5, 0)).toBeNull();
  });

  it("returns null below the 80% threshold", () => {
    expect(getBannerSeverity(7, 10)).toBeNull(); // 70%
    expect(getBannerSeverity(0, 10)).toBeNull();
  });

  it("returns warning at exactly 80%", () => {
    expect(getBannerSeverity(8, 10)).toBe("warning");
  });

  it("returns warning between 80% and 99.9%", () => {
    expect(getBannerSeverity(9, 10)).toBe("warning");
    expect(getBannerSeverity(40, 50)).toBe("warning");
    expect(getBannerSeverity(49, 50)).toBe("warning");
  });

  it("returns destructive at exactly the cap", () => {
    expect(getBannerSeverity(10, 10)).toBe("destructive");
    expect(getBannerSeverity(50, 50)).toBe("destructive");
  });

  it("returns destructive when usage exceeds cap (race conditions / legacy data)", () => {
    expect(getBannerSeverity(11, 10)).toBe("destructive");
  });

  it("aligns with WARNING_THRESHOLD constant", () => {
    expect(WARNING_THRESHOLD).toBe(0.8);
  });
});

describe("formatFeatureLabel", () => {
  it("returns user-facing labels for every numeric feature", () => {
    expect(formatFeatureLabel("users")).toBe("Users");
    expect(formatFeatureLabel("admins")).toBe("Tenant Admins");
    expect(formatFeatureLabel("departments")).toBe("Departments");
    expect(formatFeatureLabel("autoAnswerStations")).toBe(
      "Auto-Answer Stations",
    );
    expect(formatFeatureLabel("participantsPerCall")).toBe(
      "Participants per Call",
    );
    expect(formatFeatureLabel("callDurationMinutes")).toBe(
      "Group Call Duration",
    );
    expect(formatFeatureLabel("recordingHoursPerMonth")).toBe(
      "Recording Hours",
    );
    expect(formatFeatureLabel("chatRetentionDays")).toBe(
      "Chat History Retention",
    );
  });
});

describe("formatUsageMessage", () => {
  it("composes the destructive copy with usage and cap", () => {
    expect(
      formatUsageMessage("departments", 5, 5, "destructive"),
    ).toBe(
      "Departments limit reached (5/5). Upgrade your plan to add more.",
    );
  });

  it("composes the warning copy", () => {
    expect(formatUsageMessage("users", 8, 10, "warning")).toBe(
      "Approaching Users limit (8/10). Consider upgrading.",
    );
  });

  it("uses the human label for camelCase feature keys", () => {
    expect(
      formatUsageMessage("autoAnswerStations", 2, 2, "destructive"),
    ).toContain("Auto-Answer Stations");
  });
});

describe("canUpgrade", () => {
  it("returns true for free and pro", () => {
    expect(canUpgrade("free")).toBe(true);
    expect(canUpgrade("pro")).toBe(true);
  });

  it("returns false for enterprise (no upsell available)", () => {
    expect(canUpgrade("enterprise")).toBe(false);
  });
});
