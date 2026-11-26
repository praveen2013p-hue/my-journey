import { beforeEach, describe, expect, it } from "vitest";
import { __resetStoreForTests } from "./local-store";
import {
  createMutualFundProfile,
  ensureSelfProfile,
  listMutualFundProfiles,
  listMutualFundProfilesEnsuringSelf,
  setMutualFundProfileGoal,
} from "./mutual-fund-profiles";

const USER_ID = "praveen2013p@gmail.com";

beforeEach(async () => {
  await __resetStoreForTests();
});

describe("createMutualFundProfile", () => {
  it("creates a profile with the given name", async () => {
    const profile = await createMutualFundProfile(USER_ID, "Wife");
    expect(profile.name).toBe("Wife");
    expect(profile.user_id).toBe(USER_ID);
  });

  it("trims the name", async () => {
    const profile = await createMutualFundProfile(USER_ID, "  Son  ");
    expect(profile.name).toBe("Son");
  });

  it("rejects an empty (or whitespace-only) name", async () => {
    await expect(createMutualFundProfile(USER_ID, "   ")).rejects.toThrow();
  });

  it("never mixes up profiles between users", async () => {
    await createMutualFundProfile(USER_ID, "Self");
    await createMutualFundProfile("other@example.com", "Self");

    const profiles = await listMutualFundProfiles(USER_ID);
    expect(profiles).toHaveLength(1);
  });

  it("starts with no goal set", async () => {
    const profile = await createMutualFundProfile(USER_ID, "Self");
    expect(profile.goal_amount).toBeNull();
  });
});

describe("listMutualFundProfiles", () => {
  it("returns profiles oldest first", async () => {
    await createMutualFundProfile(USER_ID, "Self");
    await createMutualFundProfile(USER_ID, "Wife");
    await createMutualFundProfile(USER_ID, "Son");

    const profiles = await listMutualFundProfiles(USER_ID);
    expect(profiles.map((p) => p.name)).toEqual(["Self", "Wife", "Son"]);
  });
});

describe("ensureSelfProfile", () => {
  it("creates a 'Self' profile on first call for a brand-new user", async () => {
    const profile = await ensureSelfProfile(USER_ID);
    expect(profile.name).toBe("Self");
    expect(await listMutualFundProfiles(USER_ID)).toHaveLength(1);
  });

  it("returns the existing earliest profile instead of creating a second one", async () => {
    const first = await ensureSelfProfile(USER_ID);
    const second = await ensureSelfProfile(USER_ID);
    expect(second.id).toBe(first.id);
    expect(await listMutualFundProfiles(USER_ID)).toHaveLength(1);
  });
});

describe("listMutualFundProfilesEnsuringSelf", () => {
  it("creates and includes 'Self' for a brand-new user with no profiles yet - the sidebar must never render empty on a first visit", async () => {
    const profiles = await listMutualFundProfilesEnsuringSelf(USER_ID);
    expect(profiles.map((p) => p.name)).toEqual(["Self"]);
  });

  it("doesn't duplicate 'Self' for a user who already has profiles", async () => {
    await createMutualFundProfile(USER_ID, "Self");
    await createMutualFundProfile(USER_ID, "Wife");
    const profiles = await listMutualFundProfilesEnsuringSelf(USER_ID);
    expect(profiles.map((p) => p.name)).toEqual(["Self", "Wife"]);
  });
});

describe("setMutualFundProfileGoal", () => {
  it("sets a target corpus on the profile", async () => {
    const profile = await createMutualFundProfile(USER_ID, "Self");
    const updated = await setMutualFundProfileGoal(USER_ID, profile.id, 5000000);
    expect(updated?.goal_amount).toBe(5000000);

    const [reloaded] = await listMutualFundProfiles(USER_ID);
    expect(reloaded.goal_amount).toBe(5000000);
  });

  it("clears a goal back to null", async () => {
    const profile = await createMutualFundProfile(USER_ID, "Self");
    await setMutualFundProfileGoal(USER_ID, profile.id, 5000000);
    const cleared = await setMutualFundProfileGoal(USER_ID, profile.id, null);
    expect(cleared?.goal_amount).toBeNull();
  });

  it("returns null and changes nothing for a profile that doesn't belong to this user", async () => {
    const profile = await createMutualFundProfile("other@example.com", "Self");
    const result = await setMutualFundProfileGoal(USER_ID, profile.id, 5000000);
    expect(result).toBeNull();

    const [unchanged] = await listMutualFundProfiles("other@example.com");
    expect(unchanged.goal_amount).toBeNull();
  });
});
