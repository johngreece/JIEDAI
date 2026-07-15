SELECT metric, row_count, amount_total
FROM (
  SELECT 'attachments' AS metric, count(*)::bigint AS row_count, 0::numeric AS amount_total FROM public.attachments
  UNION ALL
  SELECT 'capital_inflows', count(*)::bigint, COALESCE(sum(amount), 0) FROM public.capital_inflows
  UNION ALL
  SELECT 'contracts', count(*)::bigint, COALESCE(sum(contract_principal), 0) FROM public.contracts
  UNION ALL
  SELECT 'customers', count(*)::bigint, 0::numeric FROM public.customers
  UNION ALL
  SELECT 'disbursements', count(*)::bigint, COALESCE(sum(amount), 0) FROM public.disbursements
  UNION ALL
  SELECT 'fund_accounts', count(*)::bigint, COALESCE(sum(balance), 0) FROM public.fund_accounts
  UNION ALL
  SELECT 'ledger_entries', count(*)::bigint, COALESCE(sum(amount), 0) FROM public.ledger_entries
  UNION ALL
  SELECT 'loan_applications', count(*)::bigint, COALESCE(sum(amount), 0) FROM public.loan_applications
  UNION ALL
  SELECT 'repayments', count(*)::bigint, COALESCE(sum(amount), 0) FROM public.repayments
) AS backup_metrics
ORDER BY metric;
