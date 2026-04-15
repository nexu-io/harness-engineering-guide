---
author: Nexu
title: "全网首发！龙虾🦞 Windows 客户端百亿 Token 实战系列"
description: "打包时间 15min→4min，安装时间 10min→2min，CI 全自动，macOS/Windows 更新彻底解耦"
category: 工程实践
date: "2026-04-15"
originalUrl: https://gist.github.com/joeylee12629-star/93772af3b2fc46a69f8e219c288148c8
---

# 全网首发！龙虾🦞 Windows 客户端百亿 Token 实战系列

> **Nexu** 是一个一键安装的开源 OpenClaw 桌面客户端，让你用 AI 掌控一切——在本地。
> GitHub：**https://github.com/nexu-io/nexu**
> ⭐ 觉得有用的话，点个 Star 就是最大的支持。

上篇：[Windows 党终于等到了！Nexu v0.1.12 + 免费模型上线](https://mp.weixin.qq.com/s/oxC1AkwsxspyCdPYG6VKPw)

上周我们发布了 Nexu v0.1.12，正式支持 Windows。作为全网首个基于 OpenClaw 的开源桌面客户端，日均处理**百亿级 token**，Windows 支持是社区呼声最高的功能。

但"支持 Windows"三个字背后，是整条打包流水线的重建。直接看结果：

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| ⏱ **打包时间** | 15 min | **4 min** |
| 📦 **安装时间** | 10 min | **2 min 以内** |
| 🔄 **CI 构建** | 手动 | **全自动** |
| 🧩 **更新逻辑** | 耦合 | **macOS/Windows 彻底解耦** |

我们在这个过程中踩了不少坑，也做了一些不那么常规的技术决策。既然是开源项目，**这些经验就不应该藏着**。这是实战系列的第一篇，希望能帮到同样在做 Electron 跨平台交付的团队。

## electron-builder 哪里不够用

![electron-builder 哪里不够用](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-01.jpg)

electron-builder 是 Electron 生态最主流的打包工具。大多数项目直接用它从源码到最终安装包一把梭，我们最初也是这么做的。

但在实际跑通 Windows 全流程之后，我们发现默认路径在这几个场景下**卡脖子**了：

- Nexu 打包后的文件树包含**约 3.8 万个文件**，默认的 ZIP 压缩方式处理这个规模极慢，安装时逐个解压更是灾难
- 需要在安装器里加入**自定义逻辑**，比如数据迁移选项、注册表清理
- macOS 和 Windows 的更新语义**完全不同**，不能用同一套流程
- CI 产物要可复现，**不能依赖本地环境**

electron-builder 仍然参与生成 `win-unpacked`（解压后的应用目录），但从这个点之后，我们接管了。

## 自定义 7z + NSIS

![自定义 7z + NSIS](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-02.jpg)

我们最终选择的方案分两步：

**第一步：electron-builder 产出 win-unpacked**
这一步 electron-builder 仍然发挥作用，生成标准的 Electron 应用目录。

**第二步：自定义打包接管**

- 用 vendored 的 **7-Zip** 将 win-unpacked 压缩为 `payload.7z`
- 用 **makensis** 编译自定义 NSIS 安装器
- 安装器负责解压、写注册表、创建快捷方式、处理卸载逻辑

**为什么选 7z？** 面对 3.8 万个文件的 Electron 应用目录，7z 的固实压缩（solid compression）可以把大量小文件当作一个整体压缩，压缩率和解压速度都远优于 ZIP。这也是安装时间从 10 分钟降到 2 分钟以内的关键。

**为什么选 NSIS？** 它给了我们对安装流程的完全控制。安装路径、数据迁移、卸载清理——所有行为都能自定义，而不是被框架的默认行为绑架。

顺便提一句，我们把 7-Zip 直接 vendor 进了仓库，这样 CI 和本地构建都不需要额外安装依赖，可复现性直接拉满。

## 平台驱动分离

![平台驱动分离](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-03.jpg)

这是我们踩的一个大坑：之前 macOS 和 Windows 的更新逻辑挤在同一条路径里，靠 `if (platform === 'win32')` 硬分叉。

问题是，这两个平台的更新语义从根本上就不同：

- macOS 可以在应用内完成**静默更新**
- Windows 需要**关闭应用 → 运行安装器 → 重启**

把它们强行塞进同一套逻辑，只会越改越脆弱，每次修 Windows 的 bug 都有可能连带搞坏 macOS。

所以我们引入了 **Update Driver** 抽象——三个独立的平台驱动：

- **mac-update-driver** — in-app 下载安装
- **windows-update-driver** — 外部下载 + 重定向安装器
- **unsupported-update-driver** — 其他平台的优雅降级

分开之后，每个平台的更新行为可以**独立演进**，互不干扰。这个模式如果你也在做跨平台 Electron 应用，强烈建议尽早引入。

## 运行时定位

![运行时定位](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-04.jpg)

还有一个容易忽略的坑：Electron 打包后运行时文件的位置取决于打包配置，但之前的代码用比较松散的方式推断路径。

这意味着一旦构建输出的目录结构稍有变化，运行时就可能找不到了——而且这种问题往往只在打包后才暴露，本地开发完全正常。

我们的解决方案是写了专用的 Windows 运行时定位器，基于 exe 相对路径做**显式查找**，把构建输出布局、运行时打包布局、运行时查找逻辑三者的契约**收紧**。

以前是"大概在这个位置"，现在是**"必须在这个位置，找不到就明确报错"**。错了就立刻知道，不会悄悄跑起来然后在用户那里炸。

## CI/CD 流水线

![CI/CD 流水线](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-05.jpg)

之前 Windows 构建基本靠本地手动跑——能不能成功取决于你的机器环境配置得对不对。

这次我们把完整的构建 → 打包 → 签名 → 发布流程搬到了 GitHub Actions：

- **nightly / beta / release** 三套 workflow 都支持 Windows
- 自动生成 `latest-win.json` 更新清单
- 产物包含安装器、hash、元数据，全程可溯

这是 Windows 从"能用"到**"能持续交付"**的基础。对于开源项目来说，可复现的 CI 流程比什么都重要——任何贡献者都能跑出一样的结果。

## 下一步

![下一步](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-06.jpg)

这次改造的核心价值不是炫酷的新功能，而是**交付基础设施的升级**。打包更可控，更新更稳定，路径更确定。

为了让用户尽早体验到新的打包流程，我们仍有一些实验性质的优化策略在验证中（比如 Windows 用户数据的生命周期迁移），后续打磨完会单独分享。

开源的意义不只是把代码放出来，更是**把踩坑的过程也分享出去**，让后来者少走弯路。

## 延伸阅读

- [Nexu GitHub](https://github.com/nexu-io/nexu) — 开源 OpenClaw 桌面客户端
- [Harness Engineering Guide](https://harness-guide.com) — 免费开源的 AI Agent 技术知识库
