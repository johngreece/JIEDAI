export function buildOverdueInterestLedgerReferenceId(overdueRecordId: string, date: string) {
  return `${overdueRecordId}:${date}`;
}

