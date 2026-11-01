import { describe, expect, it } from "vitest";
import { OwnerChangedError, runForActiveOwner } from "./owner-guard";

describe("owner-bound asynchronous actions", () => {
  it("rejects an upload stage when the signed-in account changes while it is pending", async () => {
    let activeUserId: string | null = "41";
    let finishUpload!: (value: string) => void;
    const upload = new Promise<string>(resolve => { finishUpload = resolve; });
    const guardedUpload = runForActiveOwner("41", () => activeUserId, () => upload);

    activeUserId = "52";
    finishUpload("uploaded");

    await expect(guardedUpload).rejects.toBeInstanceOf(OwnerChangedError);
  });

  it("does not start an action for a profile that is already inactive", async () => {
    let started = false;
    await expect(runForActiveOwner("41", () => "52", async () => {
      started = true;
      return "unexpected";
    })).rejects.toBeInstanceOf(OwnerChangedError);
    expect(started).toBe(false);
  });
});
