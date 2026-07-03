import { describe, expect, it } from "vitest";

import {
  INITIAL_BANNER_STATE,
  dismissRestored,
  reduceBanner,
} from "@/lib/connection-banner";

describe("connection banner state machine", () => {
  it("shows nothing during the initial connecting → open handshake", () => {
    let state = INITIAL_BANNER_STATE;
    state = reduceBanner(state, "connecting");
    expect(state.visible).toBe(false);
    state = reduceBanner(state, "open");
    expect(state).toEqual({ visible: false, tone: null, established: true });
  });

  it("does not alarm on a reconnecting status before any stream was established", () => {
    const state = reduceBanner(INITIAL_BANNER_STATE, "reconnecting");
    expect(state.visible).toBe(false);
    expect(state.tone).toBeNull();
  });

  it("shows the lost banner when an established stream drops", () => {
    let state = reduceBanner(INITIAL_BANNER_STATE, "open");
    state = reduceBanner(state, "reconnecting");
    expect(state).toEqual({ visible: true, tone: "lost", established: true });
  });

  it("holds the lost banner across repeated reconnecting ticks", () => {
    let state = reduceBanner(INITIAL_BANNER_STATE, "open");
    state = reduceBanner(state, "reconnecting");
    state = reduceBanner(state, "reconnecting");
    expect(state.tone).toBe("lost");
  });

  it("shows the restored banner only after recovering from a loss", () => {
    let state = reduceBanner(INITIAL_BANNER_STATE, "open");
    state = reduceBanner(state, "reconnecting");
    state = reduceBanner(state, "open");
    expect(state).toEqual({ visible: true, tone: "restored", established: true });
  });

  it("dismisses the restored banner and stays connected", () => {
    let state = reduceBanner(INITIAL_BANNER_STATE, "open");
    state = reduceBanner(state, "reconnecting");
    state = reduceBanner(state, "open");
    state = dismissRestored(state);
    expect(state).toEqual({ visible: false, tone: null, established: true });
  });

  it("leaves a healthy open stream untouched", () => {
    const state = reduceBanner(INITIAL_BANNER_STATE, "open");
    const steady = reduceBanner(state, "open");
    expect(steady).toBe(state);
  });

  it("ignores a stray connecting tick after establishment without clearing state", () => {
    let state = reduceBanner(INITIAL_BANNER_STATE, "open");
    state = reduceBanner(state, "reconnecting");
    const held = reduceBanner(state, "connecting");
    expect(held.tone).toBe("lost");
  });
});
