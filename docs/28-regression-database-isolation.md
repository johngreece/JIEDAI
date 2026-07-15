# 变更型回归数据库隔离

## 为什么必须隔离

以下命令会创建客户、资方、通知或完整借款链路数据：

- `npm run test:regression`
- `npm run test:launch-readiness`
- `npm run test:external-touchpoints`
- `npm run test:message-delivery-queue`

它们不得使用生产 Supabase。脚本会同时检查 `REGRESSION_DATABASE_URL`、`DATABASE_URL` 和
`DIRECT_URL` 的数据库身份；对于 Supabase，即使一个使用 pooler URL、另一个使用 direct URL，
只要项目引用相同也会拒绝运行。

`POST /api/admin/launch-readiness/notification-scenarios` 同样属于变更型回归入口。它会修改回归样本的
还款日、逾期记录和通知，因此服务进程还必须由回归脚本标记为隔离运行时，并且当前 Prisma 连接
必须指向 `REGRESSION_DATABASE_URL`。Vercel Production 无条件拒绝该入口。

## 运行方式

1. 准备独立 PostgreSQL 数据库或独立 Supabase 测试项目。
2. 对测试库执行 `prisma db push` 和安全种子初始化，确保角色与产品存在。
3. 临时设置：

```dotenv
REGRESSION_DATABASE_URL="postgresql://...isolated-test-database..."
ALLOW_REGRESSION_FIXTURES="I_UNDERSTAND_THIS_WRITES_TEST_DATA"
```

4. 执行所需回归命令。
5. 运行结束后删除 `ALLOW_REGRESSION_FIXTURES`。不要在 Vercel 生产环境或 GitHub 生产环境变量中配置它。

`REGRESSION_RUNTIME` 不需要人工配置。`test:regression` 和 `test:launch-readiness` 在启动隔离服务时
自动注入一次性运行标记，普通 `next dev`、Vercel Preview 和 Vercel Production 均不会启用场景写入。

## 凭据规则

回归脚本运行时为 `super_admin`、`manager`、`finance` 和 `operator` 创建随机临时账号，
不会记录密码；运行结束后账号会被停用并软删除。客户和资方测试密码同样在进程内随机生成，
代码库不保留共享默认密码。

## 生产可执行检查

生产库只运行只读或明确的运维命令，例如 `npm run finance:reconcile`。需要写入每日对账快照时，
使用 `npm run finance:reconcile:daily`，该命令不创建业务流水或测试主体。

管理端“上线检查”页面在生产环境只读取现有业务的汇总状态。通知场景按钮由服务端能力标记禁用，
页面不会向生产库注入客户、借款、逾期或通知样本。
