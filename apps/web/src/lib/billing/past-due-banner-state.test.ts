import { describe, expect, it } from "vitest";

import { computePastDueBannerState } from "./past-due-banner-state";

describe("computePastDueBannerState", () => {
  it("returns state with formatted deadline when status is past_due and grace_period_end is set", () => {
    const state = computePastDueBannerState({
      status: "past_due",
      grace_period_end: new Date("2026-05-31T12:00:00.000Z"),
    });

    expect(state).not.toBeNull();
    expect(state?.formattedDeadline).toBe(
      new Date("2026-05-31T12:00:00.000Z").toLocaleDateString(),
    );
  });

  it("returns null when status is active (no past-due event)", () => {
    expect(
      computePastDueBannerState({
        status: "active",
        grace_period_end: new Date("2026-05-31T12:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("returns null when status is past_due but grace_period_end is null", () => {
    // Degenerate case: a past_due row that pre-dates the grace_period_end
    // migration, or one written by a code path that forgets to set the
    // deadline. The banner must NOT render without a deadline to display.
    expect(
      computePastDueBannerState({
        status: "past_due",
        grace_period_end: null,
      }),
    ).toBeNull();
  });

  it("returns null when status is suspended (grace already expired)", () => {
    // Once the cron flips past_due → suspended, the grace window is over.
    // The suspension surface is a separate UX (admin/billing page) — the
    // grace banner is specifically for the past_due → suspended window.
    expect(
      computePastDueBannerState({
        status: "suspended",
        grace_period_end: new Date("2026-05-20T12:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("returns null when status is cancelled", () => {
    expect(
      computePastDueBannerState({
        status: "cancelled",
        grace_period_end: null,
      }),
    ).toBeNull();
  });
});
