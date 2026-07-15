# Supabase 免费层备份与恢复手册

## 1. 目标与边界

本系统继续使用 Supabase Free 作为生产数据库和私有文件存储。Supabase 官方说明免费项目应自行定期导出数据库；同时，数据库备份只包含 Storage 元数据，不包含 Storage 文件本体。因此恢复包必须同时包含：

1. PostgreSQL `public` schema 的 custom-format dump。
2. `internal-files` 私有 bucket 的全部文件、MIME 类型、大小和 SHA-256。
3. 导出时的关键表行数与 EUR 金额汇总。

参考：[Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)。

本方案不提供 PITR，不做长期归档，也不替代付费灾备。目标是小规模内部系统在免费层上的可验证恢复：

- **RPO**：不超过 7 天。
- **恢复验证**：每周自动恢复一次，不再依赖人工月度演练。
- **Artifact 保留**：21 天，始终保留约 3 个恢复点。
- **加密**：AES-256-CBC + PBKDF2-SHA256，200,000 次迭代。
- **容量红线**：75% 告警，90% 任务失败。

## 2. 自动任务

工作流：[`.github/workflows/weekly-backup.yml`](../.github/workflows/weekly-backup.yml)

每周日 02:30 UTC 自动执行，也可从 GitHub Actions 手动触发。顺序固定为：

1. 校验生产连接、Storage 凭据和至少 32 字符的加密口令。
2. 使用 PostgreSQL 17 客户端导出 `public` schema。
3. 导出私有 Storage 全部对象并逐个计算 SHA-256。
4. 首次恢复 dump，并从该固定快照生成关键业务表行数和金额汇总。
5. 打包后加密，立即删除明文压缩包。
6. 重新解密，校验文件哈希和 manifest。
7. 恢复到一次性 PostgreSQL 17 容器。
8. 比较两次恢复的表行数和 EUR 金额，检查 9 张关键表、EUR 单币种和金额合法性。
9. 验证通过后才上传 `.tar.gz.enc` artifact。
10. 上传后检查数据库和 Storage 免费层容量红线，最后清理运行器明文数据。

任何导出、解密、哈希、恢复、金额比较或容量红线失败都会让任务显示失败。即使容量超过红线，加密备份仍会先上传，避免因容量告警反而丢失最新恢复点。

## 3. GitHub Secrets

仓库 Actions 必须配置以下 secrets：

| Secret | 要求 |
|---|---|
| `DIRECT_URL` | Supabase direct/session-pooler PostgreSQL URL；不得使用 6543 transaction pooler |
| `NEXT_PUBLIC_SUPABASE_URL` | 生产 Supabase HTTPS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅服务端使用的 production service-role key |
| `SUPABASE_STORAGE_BUCKET` | 可选；为空时使用 `internal-files` |
| `BACKUP_ENCRYPTION_PASSPHRASE` | 至少 32 字符；只保存在 GitHub Secret 和内部密码库 |

加密口令不能写入仓库、PR、Issue、日志或 Vercel 环境变量。GitHub 中的 secret 不是唯一副本；内部密码库必须保存同一口令，否则在 GitHub 仓库或组织不可用时无法解密备份。

## 4. 手动验证 Storage 恢复包

解密 artifact 后，先运行只读校验。没有 `--apply` 时脚本不会连接 Supabase，也不会上传文件：

```bash
npm run storage:restore-backup -- --input /path/to/extracted/storage
```

校验内容包括 manifest 版本、对象路径穿越、重复路径、文件类型、大小、逐文件 SHA-256 和总数。

## 5. 完整灾难恢复

只允许恢复到**新建且确认无业务数据**的 Supabase 项目。不得把下面的数据库恢复命令指向现有生产项目。

### 5.1 解密

```bash
export BACKUP_ENCRYPTION_PASSPHRASE='从内部密码库读取'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
  -in internal-backup.tar.gz.enc \
  -out internal-backup.tar.gz \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE
mkdir restored-backup
tar -xzf internal-backup.tar.gz -C restored-backup
cd restored-backup
sha256sum -c checksums.sha256
```

### 5.2 恢复数据库

再次核对 `RECOVERY_DIRECT_URL` 的 Supabase project ref，确认目标是新恢复项目，然后执行：

```bash
pg_restore "$RECOVERY_DIRECT_URL" \
  --clean --if-exists --no-owner --no-acl --exit-on-error \
  database.dump
```

恢复后使用同一连接运行 `scripts/backup-database-metrics.sql`，结果必须与 `database-metrics.txt` 完全一致。

### 5.3 恢复私有文件

将恢复项目的 URL、service-role key 和 bucket 放入当前 shell，先创建/收紧私有 bucket，再上传：

```bash
export NEXT_PUBLIC_SUPABASE_URL='https://<recovery-project>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='恢复项目 service-role key'
export SUPABASE_STORAGE_BUCKET='internal-files'
npm run storage:ensure
npm run storage:restore-backup -- --input /path/to/restored-backup/storage
npm run storage:restore-backup -- --input /path/to/restored-backup/storage --apply
```

`--apply` 使用 `x-upsert: false`，目标已有同名对象时会失败，不会静默覆盖。

### 5.4 应用验收

1. 将恢复项目的新 `DATABASE_URL`、`DIRECT_URL`、Supabase URL 和 service-role key 配入临时 Preview。
2. 运行 `npm run db:enable-rls`、`npm run health-check`、`npm run verify` 和 `npm run test:launch-readiness`。
3. 管理端抽查客户 KYC、合同、放款凭证、还款凭证、资金账户余额和审计日志。
4. 客户端和资金方端分别验证一个受权限保护的文件下载。
5. 验收通过后再切换正式环境变量；旧项目保持只读，直到确认新项目稳定。

## 6. 容量策略

默认按数据库 500 MiB、Storage 1 GiB 计算免费层使用率。若 Supabase 当前套餐限制变化，可在 Actions 中用以下 repository variables 覆盖字节值：

- `FREE_TIER_DATABASE_LIMIT_BYTES`
- `FREE_TIER_STORAGE_LIMIT_BYTES`

工作流会读取这两个 repository variables；未设置时使用上述默认值。达到 75% 应清理无引用文件并评估升级；达到 90% 时任务失败，必须在下一工作日前处理。

## 7. 仍需外部完成的首轮动作

代码只建立恢复能力，不能在缺少生产 secrets 时伪造真实备份。上线前必须完成：

1. 设置上述 GitHub Secrets，并在内部密码库保存加密口令。
2. 手动触发 `Weekly encrypted backup`。
3. 确认任务通过、artifact 名称以 `supabase-backup-` 开头且只含一个 `.enc` 文件。
4. 下载首份 artifact，在隔离目录完成一次人工解密和只读 Storage 校验。
