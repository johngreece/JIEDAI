# Supabase 私有文件存储运行手册

## 1. 范围

客户证件和资金方入金凭证不再以 Base64 写入 PostgreSQL。数据库只保存
`supabase-storage://<bucket>/<object-path>?contentType=...` 引用，文件内容保存在 Supabase
Storage 私有 bucket。签名图仍属于小体积业务证据，本轮不迁移。

旧 `data:` 记录保留只读兼容，可通过本系统受保护路由读取，便于无停机迁移。

## 2. 权限边界

| 文件 | 管理端 | 客户端 | 资金方端 |
|---|---|---|---|
| 客户证件 | 需要 `customer:view` | 仅本人且账号有效 | 禁止 |
| 入金凭证 | 需要 `ledger:view` | 禁止 | 仅所属资金方且账号有效 |

浏览器不会收到 service role key、Storage 私有对象 URL或数据库内的 Storage 引用。API 只返回：

- `/api/customer-documents/:id/file`
- `/api/attachments/:id/file`

两条路由均设置 `Cache-Control: private, no-store` 和 `X-Content-Type-Options: nosniff`。

## 3. 环境变量

```env
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<server-only-service-role-key>"
SUPABASE_STORAGE_BUCKET="internal-files"
```

`SUPABASE_SERVICE_ROLE_KEY` 只能配置在 Vercel、GitHub Actions 或受控本地环境，不能进入浏览器或仓库。

## 4. 初始化

先配置环境变量，再执行：

```bash
npm run storage:ensure
```

命令可重复执行，会创建或校正私有 bucket，限制单文件 10MB，只允许 JPG、PNG、WebP 和 PDF。
应用不会在 bucket 缺失时退回 Base64；上传将返回明确的 502/503，避免继续消耗数据库容量。

## 5. 旧数据迁移

1. 先完成数据库备份并运行 `npm run storage:ensure`。
2. 只统计待迁移数据：

```bash
npm run storage:migrate-base64
```

3. 核对统计后执行迁移：

```bash
npm run storage:migrate-base64 -- --apply
```

脚本逐条上传并用原记录时间戳做乐观更新；记录已变化时删除新对象并跳过。失败可安全重跑。
迁移后再次执行 dry-run，`customerDocuments.found` 和 `attachments.found` 应为 0。

## 6. 验证

```bash
npm run check:invariants
npm run verify
npm run lint
```

在三个门户分别验证：客户本人可预览证件；有权限的管理员可预览和下载；资金方只能下载自己的入金凭证；
跨客户、跨资金方和错误门户访问返回 403 或 404。

## 7. 免费层运维

- 每月记录 Database 与 Storage 使用量，证件和凭证只计入 Storage。
- 删除或替换文件通过服务端清理旧对象；清理失败不回滚业务写入，但应从日志发现并人工处理。
- Base64 迁移释放的是逻辑数据；PostgreSQL 物理空间回收由 Supabase autovacuum 管理。
- Storage 与数据库备份是两套资产，数据库备份不包含对象内容；恢复演练必须同时验证 bucket 文件可读。
