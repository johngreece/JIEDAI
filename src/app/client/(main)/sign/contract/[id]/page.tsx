"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SignCanvas } from "@/components/SignCanvas";

type ContractData = {
  contractNo: string;
  content: string;
  status: string;
  expiryDate?: string | null;
  savedSignature?: {
    signerName: string;
    signatureData: string;
    signedAt: string;
  } | null;
};

type SignSessionData = {
  signUrl: string;
  qrImageUrl: string;
  expiresInSeconds: number;
};

function isLikelyMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

export default function ClientContractSignPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const accessToken = searchParams.get("accessToken") ?? "";
  const mode = searchParams.get("mode");

  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [canvasData, setCanvasData] = useState<string | null>(null);
  const [drawNewSignature, setDrawNewSignature] = useState(false);
  const [signSession, setSignSession] = useState<SignSessionData | null>(null);
  const [showMobileSign, setShowMobileSign] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [confirmations, setConfirmations] = useState({
    readAllTerms: false,
    confirmCapitalizedInterest: false,
    confirmLegalFee: false,
  });
  const [biometricSupported, setBiometricSupported] = useState(false);

  const signChannel = useMemo(
    () => (accessToken || mode === "mobile" ? "mobile-qr" : "mobile-direct"),
    [accessToken, mode]
  );

  useEffect(() => {
    setIsMobileDevice(isLikelyMobile());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const credentialApi = window.PublicKeyCredential;
    if (!credentialApi?.isUserVerifyingPlatformAuthenticatorAvailable) return;

    credentialApi
      .isUserVerifyingPlatformAuthenticatorAvailable()
      .then((available) => setBiometricSupported(available))
      .catch(() => setBiometricSupported(false));
  }, []);

  useEffect(() => {
    if (!id) return;

    const url = accessToken
      ? `/api/contracts/${id}?accessToken=${encodeURIComponent(accessToken)}`
      : `/api/contracts/${id}`;

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContract(data);
        if (data.savedSignature?.signatureData) {
          setCanvasData(data.savedSignature.signatureData);
          setDrawNewSignature(false);
        }
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [id, accessToken]);

  useEffect(() => {
    if (!id || accessToken || isMobileDevice || mode === "mobile") return;

    fetch(`/api/contracts/${id}/sign-session`)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSignSession(data);
      })
      .catch(() => {
        setSignSession(null);
      });
  }, [id, accessToken, isMobileDevice, mode]);

  useEffect(() => {
    if (!id || !signSession || accessToken || isMobileDevice || mode === "mobile") return;

    const timer = window.setInterval(() => {
      fetch(`/api/contracts/${id}`)
        .then((response) => response.json())
        .then((data) => {
          if (!data.error) {
            setContract(data);
          }
        })
        .catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [id, signSession, accessToken, isMobileDevice, mode]);

  function canSubmit() {
    const canReuseSavedSignature = Boolean(contract?.savedSignature?.signatureData && !drawNewSignature);
    return (
      confirmations.readAllTerms &&
      confirmations.confirmCapitalizedInterest &&
      confirmations.confirmLegalFee &&
      (canReuseSavedSignature || !!canvasData)
    );
  }

  function handleSign() {
    const reuseSavedSignature = Boolean(contract?.savedSignature?.signatureData && !drawNewSignature);

    if (!reuseSavedSignature && !canvasData) {
      setError("请先在手写区签字");
      return;
    }

    if (!confirmations.readAllTerms || !confirmations.confirmCapitalizedInterest || !confirmations.confirmLegalFee) {
      setError("请先完成关键条款确认");
      return;
    }

    setSigning(true);
    setError("");

    fetch(`/api/contracts/${id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signatureData: reuseSavedSignature ? undefined : canvasData,
        reuseSavedSignature,
        signerType: "customer",
        signerName: "",
        accessToken: accessToken || undefined,
        signChannel,
        confirmations,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setContract((current) => (current ? { ...current, status: "SIGNED" } : null));
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setSigning(false));
  }

  if (loading) {
    return <div className="flex items-center justify-center p-6">加载中...</div>;
  }

  if (error && !contract) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  if (!contract) {
    return null;
  }

  if (contract.status === "SIGNED") {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <p className="mb-4 font-medium text-green-600">合同已签署</p>
        <Link href="/client/dashboard" className="text-blue-600 hover:underline">
          返回我的借款
        </Link>
      </div>
    );
  }

  if (contract.status === "EXPIRED" || contract.status === "CANCELLED") {
    return (
      <div className="flex flex-col items-center justify-center p-6">
        <p className="mb-2 font-medium text-slate-800">合同已失效</p>
        <p className="mb-4 text-sm text-slate-500">
          该借款已结清或合同已作废，当前无需再次签署。
        </p>
        <Link href="/client/dashboard" className="text-blue-600 hover:underline">
          返回我的借款
        </Link>
      </div>
    );
  }

  const requireMobileFlow = !isMobileDevice && !accessToken && mode !== "mobile" && !showMobileSign;
  const hasSavedSignature = Boolean(contract.savedSignature?.signatureData);
  const shouldDrawSignature = !hasSavedSignature || drawNewSignature;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="panel-soft mb-4 flex items-center justify-between rounded-xl px-4 py-3">
        <Link href="/client/dashboard" className="text-sm text-slate-500 hover:underline">
          返回
        </Link>
        <span className="text-sm text-slate-600">合同号：{contract.contractNo}</span>
      </div>

      <div className="table-shell mb-4 max-h-[45vh] overflow-auto rounded-lg p-4">
        <div dangerouslySetInnerHTML={{ __html: contract.content || "" }} className="prose prose-sm max-w-none" />
      </div>

      {requireMobileFlow ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">请用手机完成签署</h2>
          <p className="mt-2 text-sm text-slate-600">
            电脑端默认不直接签字。请扫码后在手机上签署，签完后此页会自动刷新状态。
          </p>

          {signSession ? (
            <div className="mt-4 flex flex-col items-start gap-4 md:flex-row md:items-center">
              {/* QR code comes from an API-generated data URL / short-lived sign session URL, so a raw img is intentional here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={signSession.qrImageUrl}
                alt="合同签署二维码"
                className="h-48 w-48 rounded-xl border border-slate-200 bg-white p-2"
              />
              <div className="space-y-3">
                <p className="text-sm text-slate-600">二维码 15 分钟内有效。</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(signSession.signUrl)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  复制手机签署链接
                </button>
                <button
                  type="button"
                  onClick={() => setShowMobileSign(true)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                >
                  临时在本机签署
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-500">正在生成二维码...</div>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-semibold text-slate-900">签署前确认</h2>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmations.readAllTerms}
                  onChange={(event) =>
                    setConfirmations((current) => ({ ...current, readAllTerms: event.target.checked }))
                  }
                />
                <span>我已完整阅读并理解本合同全部条款。</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmations.confirmCapitalizedInterest}
                  onChange={(event) =>
                    setConfirmations((current) => ({
                      ...current,
                      confirmCapitalizedInterest: event.target.checked,
                    }))
                  }
                />
                <span>我已确认收益并入本金的金额口径，以及该金额将进入合同本金与后续还款口径。</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmations.confirmLegalFee}
                  onChange={(event) =>
                    setConfirmations((current) => ({ ...current, confirmLegalFee: event.target.checked }))
                  }
                />
                <span>我已确认法律服务费/服务费率及逾期费用规则。</span>
              </label>
            </div>
          </div>

          <div className="panel-soft mb-4 rounded-lg p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-700">
                {hasSavedSignature && !drawNewSignature ? "已保存签名" : "手写签字"}
              </p>
              {hasSavedSignature ? (
                <button
                  type="button"
                  onClick={() => {
                    if (drawNewSignature) {
                      setCanvasData(contract.savedSignature?.signatureData ?? null);
                      setDrawNewSignature(false);
                    } else {
                      setCanvasData(null);
                      setDrawNewSignature(true);
                    }
                  }}
                  className="self-start rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 sm:self-auto"
                >
                  {drawNewSignature ? "使用已保存签名" : "重新签名"}
                </button>
              ) : null}
            </div>

            {hasSavedSignature && !drawNewSignature ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                {/* The signature is a customer-owned data URL returned by the contract API. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={contract.savedSignature?.signatureData}
                  alt="已保存的客户签名"
                  className="h-20 max-w-full object-contain"
                />
                <p className="mt-2 text-xs text-emerald-700">
                  系统已留存你的签名，本次合同会自动落签，无需重复手写。
                </p>
              </div>
            ) : null}

            {shouldDrawSignature ? <SignCanvas onDataUrl={setCanvasData} /> : null}
            <p className="mt-3 text-xs text-slate-500">
              {biometricSupported
                ? "当前设备支持生物识别能力，下一步可以接入 WebAuthn 作为签署前二次确认。"
                : "当前流程为基础电子签留痕版本，后续如需“按一次指纹”效果，建议接 WebAuthn 或第三方电子签。"}
            </p>
          </div>

          {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

          <button
            type="button"
            onClick={handleSign}
            disabled={signing || !canSubmit()}
            className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {signing ? "提交中..." : "确认签署"}
          </button>
        </>
      )}
    </div>
  );
}
