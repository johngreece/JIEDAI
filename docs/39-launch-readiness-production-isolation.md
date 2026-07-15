# 上线检查生产隔离

## 风险

通知场景验收会依次模拟临近到期、当日到期和逾期阶段。模拟过程需要临时修改还款计划日期、
逾期记录和客户通知。在生产库执行该流程会干扰真实催收、通知幂等和审计追踪，异常中断或并发
业务写入还可能导致无法完整恢复。

## 运行时门禁

`POST /api/admin/launch-readiness/notification-scenarios` 在任何权限查询和 Prisma 访问前验证：

1. `VERCEL_ENV` 不是 `production`。
2. `ALLOW_REGRESSION_FIXTURES=I_UNDERSTAND_THIS_WRITES_TEST_DATA`。
3. 服务由回归脚本设置隔离运行标记。
4. `DATABASE_URL` 与 `REGRESSION_DATABASE_URL` 指向同一数据库。
5. 配置 `DIRECT_URL` 时，它也必须指向同一隔离数据库。

任一条件不满足时接口返回 `403`，不读取或修改业务数据库。

## 页面行为

`GET /api/admin/launch-readiness` 返回 `scenarioFixturesEnabled`。管理端据此区分：

- 生产模式：展示只读业务健康、风险、资金预测和现有通知，禁用场景写入。
- 隔离回归模式：允许生成通知场景，并在执行结束后清理回归样本。

页面不再提供生产演示数据注入入口。

## 自动守卫

- `src/lib/regression-runtime.test.ts` 覆盖数据库身份、运行标记和 Vercel Production 拒绝。
- `src/lib/launch-readiness-isolation-guard.test.ts` 固定路由门禁顺序和页面能力控制。
- `scripts/check-system-invariants.js` 阻止删除生产只读约束或重新暴露演示数据注入。
