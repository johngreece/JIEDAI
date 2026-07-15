"use client";

import { useCallback, useEffect, useState } from "react";

type RunSummary = {
  scannedAt: string;
  counts: Record<string, number>;
  findingsByCode: Record<string, number>;
};

type ReconciliationRun = {
  id: string;
  runKey: string;
  status: string;
  findingCount: number;
  openFindingCount: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  summary: RunSummary | null;
};

type ReconciliationFinding = {
  id: string;
  code: string;
  severity: string;
  entityType: string;
  entityId: string | null;
  expectedValue: string | null;
  actualValue: string | null;
  description: string;
  owner: string;
  recommendedAction: string;
  status: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
};

type SelectedRun = ReconciliationRun & { findings: ReconciliationFinding[] };

type ApiResponse = {
  runs: ReconciliationRun[];
  selectedRun: SelectedRun | null;
};

type Resolution = {
  id: string;
  status: "RESOLVED" | "IGNORED";
  code: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function runTone(status: string) {
  if (status === "CLEAN") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "DIFFERENCE") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "FAILED") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function findingTone(status: string) {
  if (status === "RESOLVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "IGNORED") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function FinanceReconciliationPageClient() {
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<SelectedRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async (runId?: string) => {
    setLoading(true);
    setError("");
    try {
      const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
      const response = await fetch(`/api/admin/finance-reconciliation${query}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as ApiResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "加载对账数据失败");
      setRuns(data.runs ?? []);
      setSelectedRun(data.selectedRun ?? null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "加载对账数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function scan() {
    setScanning(true);
    setError("");
    try {
      const response = await fetch("/api/admin/finance-reconciliation", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? data.error ?? "执行对账失败");
      await load(data.run?.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "执行对账失败");
    } finally {
      setScanning(false);
    }
  }

  async function submitResolution() {
    if (!resolution || resolutionNote.trim().length < 3) return;
    setResolving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/finance-reconciliation/${resolution.id}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: resolution.status,
            note: resolutionNote.trim(),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "保存处理结果失败");
      const runId = selectedRun?.id;
      setResolution(null);
      setResolutionNote("");
      await load(runId);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存处理结果失败");
    } finally {
      setResolving(false);
    }
  }

  const findings = selectedRun?.findings ?? [];
  const resolvedCount = findings.filter((item) => item.status === "RESOLVED").length;
  const ignoredCount = findings.filter((item) => item.status === "IGNORED").length;

  return (
    <div className="space-y-5 2xl:space-y-6">
      <header className="panel-soft admin-page-header">
        <div className="admin-page-header__meta">
          <span className="admin-page-header__eyebrow">Finance Integrity</span>
          <h1 className="admin-page-header__title">资金对账</h1>
          <p className="admin-page-header__description">
            全历史资金事件、客户台账、资金流水与账户余额链完整性。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedRun?.id ?? ""}
            onChange={(event) => void load(event.target.value)}
            aria-label="选择对账批次"
            className="admin-input min-w-[250px]"
          >
            {runs.length === 0 ? <option value="">暂无对账批次</option> : null}
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {formatDate(run.startedAt)} · {run.status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load(selectedRun?.id)}
            disabled={loading}
            className="admin-btn admin-btn-secondary"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={() => void scan()}
            disabled={scanning}
            className="admin-btn admin-btn-primary"
          >
            {scanning ? "正在扫描" : "立即全量对账"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">批次状态</p>
          <div className="mt-3">
            <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${runTone(selectedRun?.status ?? "RUNNING")}`}>
              {selectedRun?.status ?? (loading ? "LOADING" : "NO RUN")}
            </span>
          </div>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">发现差异</p>
          <p className="admin-stat-card__value text-rose-600">{selectedRun?.findingCount ?? 0}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">未处理</p>
          <p className="admin-stat-card__value text-amber-600">{selectedRun?.openFindingCount ?? 0}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">已处理</p>
          <p className="admin-stat-card__value text-emerald-600">{resolvedCount}</p>
        </div>
        <div className="stat-tile admin-stat-card">
          <p className="admin-stat-card__label">有依据忽略</p>
          <p className="admin-stat-card__value text-slate-600">{ignoredCount}</p>
        </div>
      </section>

      <section className="table-shell admin-table-shell">
        <div className="admin-table-toolbar">
          <div>
            <div className="admin-table-title">差异清单</div>
            <p className="admin-table-note">
              批次 {selectedRun?.runKey ?? "-"} · 完成时间 {formatDate(selectedRun?.completedAt ?? null)}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="border-t border-slate-200 px-4 py-10 text-center text-slate-500">
            正在加载对账结果
          </div>
        ) : findings.length === 0 ? (
          <div className="border-t border-slate-200 px-4 py-10 text-center text-emerald-700">
            当前批次未发现资金差异
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <th className="px-4 py-3">差异</th>
                <th className="px-4 py-3">业务对象</th>
                <th className="px-4 py-3">期望 / 实际</th>
                <th className="px-4 py-3">责任与动作</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">处理</th>
              </tr>
            </thead>
              <tbody className="divide-y divide-slate-100">
                {findings.map((finding) => (
                  <tr key={finding.id} className="align-top hover:bg-slate-50/60">
                    <td className="max-w-[300px] px-4 py-4">
                      <div className="font-semibold text-slate-900">{finding.code}</div>
                      <p className="mt-2 leading-6 text-slate-600">{finding.description}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">{finding.entityType}</div>
                      <div className="mt-1 max-w-[220px] break-all font-mono text-xs text-slate-500">
                        {finding.entityId ?? "-"}
                      </div>
                    </td>
                    <td className="max-w-[360px] px-4 py-4 text-xs">
                      <div className="break-all rounded-md bg-emerald-50 p-2 text-emerald-800">
                        <span className="font-semibold">期望：</span>{finding.expectedValue ?? "-"}
                      </div>
                      <div className="mt-2 break-all rounded-md bg-rose-50 p-2 text-rose-800">
                        <span className="font-semibold">实际：</span>{finding.actualValue ?? "-"}
                      </div>
                    </td>
                    <td className="max-w-[340px] px-4 py-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {finding.owner}
                      </div>
                      <p className="mt-2 leading-6 text-slate-700">{finding.recommendedAction}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${findingTone(finding.status)}`}>
                        {finding.status}
                      </span>
                      {finding.resolutionNote ? (
                        <p className="mt-2 max-w-[220px] text-xs leading-5 text-slate-500">
                          {finding.resolutionNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      {finding.status === "OPEN" ? (
                        <div className="flex min-w-[140px] flex-col gap-2">
                          <button
                            type="button"
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => {
                              setResolution({ id: finding.id, code: finding.code, status: "RESOLVED" });
                              setResolutionNote("");
                            }}
                          >
                            标记已处理
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => {
                              setResolution({ id: finding.id, code: finding.code, status: "IGNORED" });
                              setResolutionNote("");
                            }}
                          >
                            带说明忽略
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">已留痕</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {resolution ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold text-slate-900">
              {resolution.status === "IGNORED" ? "带说明忽略差异" : "标记差异已处理"}
            </div>
            <p className="mt-2 break-all text-sm text-slate-500">{resolution.code}</p>
            <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="resolution-note">
              处理依据
            </label>
            <textarea
              id="resolution-note"
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              rows={5}
              maxLength={1000}
              autoFocus
              className="admin-input mt-2 w-full resize-y"
              placeholder="填写核对依据、凭证位置或后续动作"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  setResolution(null);
                  setResolutionNote("");
                }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={resolving || resolutionNote.trim().length < 3}
                className="admin-btn admin-btn-primary"
                onClick={() => void submitResolution()}
              >
                {resolving ? "正在保存" : "确认留痕"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
