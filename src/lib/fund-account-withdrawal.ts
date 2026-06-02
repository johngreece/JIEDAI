export type WithdrawalFundAccountCandidate = {
  id: string;
};

export function orderWithdrawalFundAccountIds(
  accounts: WithdrawalFundAccountCandidate[],
  preferredAccountId?: string | null,
) {
  const ids = preferredAccountId
    ? [
        ...accounts.filter((account) => account.id === preferredAccountId),
        ...accounts.filter((account) => account.id !== preferredAccountId),
      ]
    : accounts;

  return Array.from(new Set(ids.map((account) => account.id)));
}
