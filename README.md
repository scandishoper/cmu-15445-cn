# CMU 15-445 中文学习站

一个无框架、无运行时依赖的静态阅读站，重点是简洁、快速和长文阅读体验。

## 当前内容状态

本次提供的 `Project.zip` 中没有课程正文、Markdown、图片或爬虫源码，仅包含 `cmu15445-crawler/.venv` Python 虚拟环境。为了严格遵守“网站内容只使用压缩包内内容”的要求，站点当前不包含任何自行补写的课程内容。

## 本地预览

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## 内容结构

课程内容放在 `content/` 中，并在 `content/manifest.json` 登记：

```json
[
  {
    "id": "lecture-01",
    "group": "Lectures",
    "title": "课程标题",
    "summary": "可选摘要",
    "file": "lecture-01.md"
  }
]
```

页面会按清单生成目录、搜索标题并加载对应 Markdown 文件。

## 部署

合并到 `main` 后，GitHub Actions 会将仓库根目录发布到 GitHub Pages。
