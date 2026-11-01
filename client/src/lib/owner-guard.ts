export class OwnerChangedError extends Error {
  constructor() {
    super("The signed-in account changed before this action finished. No data was saved to the new account.");
    this.name = "OwnerChangedError";
  }
}

export function assertActiveOwner(expectedUserId: string, activeUserId: string | null): void {
  if (!expectedUserId || activeUserId !== expectedUserId) throw new OwnerChangedError();
}

export async function runForActiveOwner<T>(
  expectedUserId: string,
  getActiveUserId: () => string | null,
  action: () => Promise<T>,
): Promise<T> {
  assertActiveOwner(expectedUserId, getActiveUserId());
  const result = await action();
  assertActiveOwner(expectedUserId, getActiveUserId());
  return result;
}
