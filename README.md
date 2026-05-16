# 周末去哪

一个部署在 GitHub Pages 的周末 idea 投票网页。前端使用 React + Vite，数据使用 Supabase 共享存储。

## 功能

- 输入用户名后提交周末去哪的 idea。
- 用“浏览器设备 ID + 用户名”识别用户。
- 只能编辑自己在当前浏览器和用户名下提交的 idea。
- 每个用户对每个 idea 最多投一票，可取消投票。
- 看板展示 idea、票数和投票人名单。

## Supabase 设置

1. 新建 Supabase 项目。
2. 打开 SQL Editor，执行 [`supabase/schema.sql`](supabase/schema.sql)。
3. 在 Project Settings > API 里复制 Project URL 和 anon public key。
4. 本地创建 `.env.local`：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

这个项目不做账号登录，RLS 策略允许匿名读写。前端用浏览器本地保存的 ID 和用户名做轻量身份识别，适合小团队临时投票，不适合强权限场景。

## 本地运行

```bash
npm install
npm run dev
```

## 部署到 GitHub Pages

1. 把代码推到 GitHub 仓库的 `main` 分支。
2. 在仓库 Settings > Secrets and variables > Actions 中配置：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. 在 Settings > Pages 中选择 GitHub Actions 作为部署来源。
4. 推送到 `main` 后 workflow 会构建并部署 `dist`。

Vite 会在 GitHub Actions 中自动把 `base` 设置为 `/<仓库名>/`。如果你的 Pages 不是这个路径，可以设置 `VITE_BASE_PATH` 覆盖。
