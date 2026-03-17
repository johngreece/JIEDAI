# PostCSS / Tailwind 报错审计说明

## 问题现象
```
Error: Cannot find module 'tailwindcss'
Require stack: ... plugins.js
```

## 根本原因

1. **Next.js 如何加载 PostCSS 配置**（`find-config.js`）：
   - **优先**：读 `package.json` 里的 `"postcss"` 键；若存在且为对象，**直接返回，不再读任何 postcss 配置文件**。
   - **其次**：若没有，再用 find-up 从项目目录**向上**查找：`.postcssrc.json`、`postcss.config.json`、`.postcssrc.js`、`postcss.config.js`、`postcss.config.mjs`、`postcss.config.cjs`。

2. **为何一直报 tailwindcss**：
   - 要么读到了**上级目录**的某个 `postcss.config.*`（例如盘符根目录、用户目录等），其中包含 `tailwindcss`。
   - 要么读到的配置文件里插件是**对象形式** `{ tailwindcss: {}, autoprefixer: {} }`，被 Next 转成 `['tailwindcss', {}]`，随后对字符串 `'tailwindcss'` 做 `require.resolve('tailwindcss', { paths: [dir] })`，在**当前解析上下文**下找不到模块就报错。

3. **之前改 postcss.config.js 无效的原因**：
   - 若存在**任意** `package.json` 的 `postcss`（包括上级目录的 package.json），会优先用那份配置，项目里的 `postcss.config.js` 根本不会被用到。
   - 或者 find-up 先命中上级目录的 postcss 配置文件，导致用的不是项目里的那份。

## 最终方案（已实施）

- **把 PostCSS 配置写进项目自己的 `package.json`**，并**删除项目内的所有 postcss 配置文件**（如 `postcss.config.js`）。
- 这样 Next 会**只**使用 `package.json` 的 `postcss`，且其中**只使用 Next 自带的插件**：
  - `next/dist/compiled/postcss-flexbugs-fixes`
  - `next/dist/compiled/postcss-preset-env`
- **不引用 `tailwindcss`**，因此不会再执行 `require('tailwindcss')`，报错从根源消除。

## 当前项目状态

- `package.json` 中已有 `"postcss": { "plugins": [ ... ] }`（仅 Next 内置插件）。
- 已删除 `postcss.config.js`，避免被误用或与上级目录配置混淆。
- `src/app/globals.css` 为纯 CSS，无 `@tailwind`，样式由类名 + 现有 CSS 提供。

## 若以后要启用 Tailwind

1. 在项目根目录执行：  
   `node -e "console.log(require.resolve('tailwindcss', { paths: [process.cwd()] }))"`  
   确认能打印出 `...\node_modules\tailwindcss\...` 的路径。
2. 在 `package.json` 的 `postcss.plugins` 里增加 tailwind 相关配置，或恢复 `postcss.config.js` 并确保**仅项目根目录**存在该文件，且内容中引用的是可解析的 tailwind 路径。
3. 在 `globals.css` 中恢复 `@tailwind base/components/utilities` 等指令。

## 建议操作

清缓存后重新启动：

```powershell
cd f:\DAIKUAN
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```
