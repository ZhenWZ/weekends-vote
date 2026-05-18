# 周末去哪

一个部署在 GitHub Pages 的周末 idea 投票网页。前端使用 React + Vite，数据使用 Supabase 共享存储。

## 功能

- 输入用户名后提交周末去哪的 idea。
- 提交页和看板页通过顶部导航切换。
- 每个 idea 可在创建时上传最多 3 张图片，单张不超过 3MB，支持 JPG、PNG、WebP。
- 用用户名识别用户；同一个用户名在不同浏览器中也会被视为同一个人。
- 只能编辑自己用户名下提交的 idea。
- 每个用户对每个 idea 最多投一票，可取消投票。
- 看板支持卡片和列表两种视图；卡片显示图片轮播，列表使用紧凑布局。

## Supabase 设置

1. 新建 Supabase 项目。
2. 打开 SQL Editor，执行 [`supabase/schema.sql`](supabase/schema.sql)。脚本会创建数据表、RLS 策略和公开的 `idea-images` Storage bucket。
3. 在 Project Settings > API 里复制 Project URL 和 anon public key。
4. 本地创建 `.env.local`：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

这个项目不做账号登录，RLS 策略允许匿名读写。前端会在浏览器本地记住上次输入的用户名，但真正的轻量身份以用户名为准，适合小团队临时投票，不适合强权限场景。

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
