/**
 * 统一业务错误码体系
 * 格式: EXXYYY — XX = 模块编号, YYY = 错误序号
 *
 * 模块:
 *   10 = 认证/授权
 *   20 = 客户
 *   30 = 贷款申请
 *   40 = 合同
 *   50 = 放款
 *   60 = 还款
 *   70 = 逾期
 *   80 = 展期/重组
 *   90 = 资金/台账
 *   99 = 系统通用
 */

export const ErrorCodes = {
  // ── 认证/授权 (10) ──
  AUTH_REQUIRED:       { code: "E10001", message: "请先登录", status: 401 },
  AUTH_INVALID_CRED:   { code: "E10002", message: "用户名或密码错误", status: 401 },
  AUTH_DISABLED:       { code: "E10003", message: "账户已禁用", status: 403 },
  AUTH_NO_PERMISSION:  { code: "E10004", message: "没有操作权限", status: 403 },
  AUTH_TOKEN_EXPIRED:  { code: "E10005", message: "登录已过期，请重新登录", status: 401 },
  AUTH_NO_PASSWORD:    { code: "E10006", message: "账户未设置密码，请联系管理员", status: 401 },

  // ── 客户 (20) ──
  CUSTOMER_NOT_FOUND:  { code: "E20001", message: "客户不存在", status: 404 },
  CUSTOMER_DUPLICATE:  { code: "E20002", message: "客户已存在（手机号或证件号重复）", status: 409 },
  CUSTOMER_BLACKLIST:  { code: "E20003", message: "客户已被列入黑名单", status: 403 },

  // ── 贷款申请 (30) ──
  LOAN_NOT_FOUND:      { code: "E30001", message: "借款申请不存在", status: 404 },
  LOAN_INVALID_STATUS: { code: "E30002", message: "借款申请状态不正确", status: 400 },
  LOAN_AMOUNT_EXCEED:  { code: "E30003", message: "借款金额超出产品限额", status: 400 },
  LOAN_PRODUCT_NA:     { code: "E30004", message: "贷款产品不存在或已下架", status: 404 },

  // ── 合同 (40) ──
  CONTRACT_NOT_FOUND:  { code: "E40001", message: "合同不存在", status: 404 },
  CONTRACT_EXISTS:     { code: "E40002", message: "主合同已存在", status: 400 },
  CONTRACT_NO_TPL:     { code: "E40003", message: "系统未配置有效的合同模板", status: 500 },
  CONTRACT_BAD_STATUS: { code: "E40004", message: "合同状态不正确", status: 400 },

  // ── 放款 (50) ──
  DISB_NOT_FOUND:      { code: "E50001", message: "放款单不存在", status: 404 },
  DISB_EXISTS:         { code: "E50002", message: "该申请已创建放款单", status: 400 },
  DISB_BAD_STATUS:     { code: "E50003", message: "放款单状态不正确", status: 400 },
  DISB_NET_ZERO:       { code: "E50004", message: "实到金额必须大于 0", status: 400 },
  DISB_FUND_NA:        { code: "E50005", message: "资金账户不存在或不可用", status: 404 },

  // ── 还款 (60) ──
  REPAY_NOT_FOUND:     { code: "E60001", message: "还款记录不存在", status: 404 },
  REPAY_PLAN_NA:       { code: "E60002", message: "还款计划不存在", status: 404 },
  REPAY_BAD_STATUS:    { code: "E60003", message: "还款状态不允许此操作", status: 400 },
  REPAY_PLAN_INACTIVE: { code: "E60004", message: "仅 ACTIVE 计划可登记还款", status: 400 },

  // ── 逾期 (70) ──
  OVERDUE_NOT_FOUND:   { code: "E70001", message: "逾期记录不存在", status: 404 },

  // ── 展期/重组 (80) ──
  EXT_NOT_FOUND:       { code: "E80001", message: "展期记录不存在", status: 404 },
  EXT_BAD_STATUS:      { code: "E80002", message: "展期状态不正确", status: 400 },
  EXT_LIMIT:           { code: "E80003", message: "已达最大展期次数", status: 400 },
  RESTR_NOT_FOUND:     { code: "E80011", message: "重组记录不存在", status: 404 },

  // ── 资金/台账 (90) ──
  FUND_NOT_FOUND:      { code: "E90001", message: "资金账户不存在", status: 404 },
  FUND_INSUFFICIENT:   { code: "E90002", message: "资金账户余额不足", status: 400 },
  LEDGER_ENTRY_FAIL:   { code: "E90003", message: "台账记账失败", status: 500 },

  // ── 系统通用 (99) ──
  VALIDATION_ERROR:    { code: "E99001", message: "参数校验失败", status: 400 },
  INTERNAL_ERROR:      { code: "E99002", message: "系统内部错误", status: 500 },
  NOT_FOUND:           { code: "E99003", message: "资源不存在", status: 404 },
  CONFLICT:            { code: "E99004", message: "操作冲突，请稍后重试", status: 409 },
  IDEMPOTENT_DUP:      { code: "E99005", message: "重复请求，已忽略", status: 200 },
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/** 统一构造 API 错误响应 */
export function apiError(
  errDef: (typeof ErrorCodes)[ErrorCode],
  details?: unknown
) {
  return Response.json(
    {
      code: errDef.code,
      message: errDef.message,
      ...(details !== undefined && { details }),
    },
    { status: errDef.status }
  );
}

/** 统一构造 API 成功响应 */
export function apiSuccess<T>(data: T, status = 200) {
  return Response.json({ code: "OK", data }, { status });
}
