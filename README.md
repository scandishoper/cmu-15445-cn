# CMU 15-445/645 · Fall 2025

CMU 15-445/645（Intro to Database Systems）Fall 2025 课程资料阅读站。

站点正文、课件、讲义、作业、Project 说明、图片与 BusTub 工具均来自仓库内的课程归档；构建过程只重组导航与阅读界面，不改写课程正文。

## 本地运行

```bash
npm ci
npm run build
python3 -m http.server 4173 --directory _site
```

然后访问 <http://localhost:4173>。

## 目录

- `content/`：原始课程归档及抓取清单
- `scripts/build.mjs`：静态站点生成与内容完整性检查
- `src/`：阅读界面的样式与交互
- `.github/workflows/pages.yml`：GitHub Pages 自动构建与发布

课程版权归原作者与 Carnegie Mellon University 所有。本仓库用于课程资料归档与学习。
