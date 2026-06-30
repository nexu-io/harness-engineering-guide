---
author: Nexu
title: "全網首發！龍蝦🦞 Windows 客戶端百億 Token 實戰系列"
description: "打包時間 15min→4min，安裝時間 10min→2min，CI 全自動，macOS/Windows 更新徹底解耦"
category: 工程實踐
date: "2026-04-15"
originalUrl: https://gist.github.com/joeylee12629-star/93772af3b2fc46a69f8e219c288148c8
---

# 全網首發！龍蝦🦞 Windows 客戶端百億 Token 實戰系列

> **Nexu** 是一個一鍵安裝的開源 OpenClaw 桌面客戶端，讓你用 AI 掌控一切——在本地。
> GitHub：**https://github.com/nexu-io/nexu**
> ⭐ 覺得有用的話，點個 Star 就是最大的支援。

上篇：[Windows 黨終於等到了！Nexu v0.1.12 + 免費模型上線](https://mp.weixin.qq.com/s/oxC1AkwsxspyCdPYG6VKPw)

上週我們釋出了 Nexu v0.1.12，正式支援 Windows。作為全網首個基於 OpenClaw 的開源桌面客戶端，日均處理**百億級 token**，Windows 支援是社群呼聲最高的功能。

但"支援 Windows"三個字背後，是整條打包流水線的重建。直接看結果：

| 指標 | 最佳化前 | 最佳化後 |
|------|--------|--------|
| ⏱ **打包時間** | 15 min | **4 min** |
| 📦 **安裝時間** | 10 min | **2 min 以內** |
| 🔄 **CI 構建** | 手動 | **全自動** |
| 🧩 **更新邏輯** | 耦合 | **macOS/Windows 徹底解耦** |

我們在這個過程中踩了不少坑，也做了一些不那麼常規的技術決策。既然是開源專案，**這些經驗就不應該藏著**。這是實戰系列的第一篇，希望能幫到同樣在做 Electron 跨平臺交付的團隊。

## electron-builder 哪裡不夠用

![electron-builder 哪裡不夠用](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-01.jpg)

electron-builder 是 Electron 生態最主流的打包工具。大多數專案直接用它從原始碼到最終安裝包一把梭，我們最初也是這麼做的。

但在實際跑通 Windows 全流程之後，我們發現預設路徑在這幾個場景下**卡脖子**了：

- Nexu 打包後的檔案樹包含**約 3.8 萬個檔案**，預設的 ZIP 壓縮方式處理這個規模極慢，安裝時逐個解壓更是災難
- 需要在安裝器里加入**自訂邏輯**，比如資料遷移選項、登錄檔清理
- macOS 和 Windows 的更新語義**完全不同**，不能用同一套流程
- CI 產物要可復現，**不能依賴本地環境**

electron-builder 仍然參與生成 `win-unpacked`（解壓後的應用目錄），但從這個點之後，我們接管了。

## 自訂 7z + NSIS

![自訂 7z + NSIS](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-02.jpg)

我們最終選擇的方案分兩步：

**第一步：electron-builder 產出 win-unpacked**
這一步 electron-builder 仍然發揮作用，生成標準的 Electron 應用目錄。

**第二步：自訂打包接管**

- 用 vendored 的 **7-Zip** 將 win-unpacked 壓縮為 `payload.7z`
- 用 **makensis** 編譯自訂 NSIS 安裝器
- 安裝器負責解壓、寫登錄檔、建立快捷方式、處理解除安裝邏輯

**為什麼選 7z？** 面對 3.8 萬個檔案的 Electron 應用目錄，7z 的固實壓縮（solid compression）可以把大量小檔案當作一個整體壓縮，壓縮率和解壓速度都遠優於 ZIP。這也是安裝時間從 10 分鐘降到 2 分鐘以內的關鍵。

**為什麼選 NSIS？** 它給了我們對安裝流程的完全控制。安裝路徑、資料遷移、解除安裝清理——所有行為都能自訂，而不是被框架的預設行為綁架。

順便提一句，我們把 7-Zip 直接 vendor 進了倉庫，這樣 CI 和本地構建都不需要額外安裝依賴，可復現性直接拉滿。

## 平臺驅動分離

![平臺驅動分離](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-03.jpg)

這是我們踩的一個大坑：之前 macOS 和 Windows 的更新邏輯擠在同一條路徑裡，靠 `if (platform === 'win32')` 硬分叉。

問題是，這兩個平臺的更新語義從根本上就不同：

- macOS 可以在應用內完成**靜默更新**
- Windows 需要**關閉應用 → 執行安裝器 → 重啟**

把它們強行塞進同一套邏輯，只會越改越脆弱，每次修 Windows 的 bug 都有可能連帶搞壞 macOS。

所以我們引入了 **Update Driver** 抽象——三個獨立的平臺驅動：

- **mac-update-driver** — in-app 下載安裝
- **windows-update-driver** — 外部下載 + 重定向安裝器
- **unsupported-update-driver** — 其他平臺的優雅降級

分開之後，每個平臺的更新行為可以**獨立演進**，互不干擾。這個模式如果你也在做跨平臺 Electron 應用，強烈建議儘早引入。

## 執行時定位

![執行時定位](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-04.jpg)

還有一個容易忽略的坑：Electron 打包後執行時檔案的位置取決於打包配置，但之前的程式碼用比較鬆散的方式推斷路徑。

這意味著一旦構建輸出的目錄結構稍有變化，執行時就可能找不到了——而且這種問題往往只在打包後才暴露，本地開發完全正常。

我們的解決方案是寫了專用的 Windows 執行時定位器，基於 exe 相對路徑做**顯式查詢**，把構建輸出佈局、執行時打包佈局、執行時查詢邏輯三者的契約**收緊**。

以前是"大概在這個位置"，現在是**"必須在這個位置，找不到就明確報錯"**。錯了就立刻知道，不會悄悄跑起來然後在使用者那裡炸。

## CI/CD 流水線

![CI/CD 流水線](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-05.jpg)

之前 Windows 構建基本靠本地手動跑——能不能成功取決於你的機器環境配置得對不對。

這次我們把完整的構建 → 打包 → 簽名 → 釋出流程搬到了 GitHub Actions：

- **nightly / beta / release** 三套 workflow 都支援 Windows
- 自動生成 `latest-win.json` 更新清單
- 產物包含安裝器、hash、後設資料，全程可溯

這是 Windows 從"能用"到**"能持續交付"**的基礎。對於開源專案來說，可復現的 CI 流程比什麼都重要——任何貢獻者都能跑出一樣的結果。

## 下一步

![下一步](https://raw.githubusercontent.com/joeylee12629-star/article-assets/main/win-packaging/sec-cn-06.jpg)

這次改造的核心價值不是炫酷的新功能，而是**交付基礎設施的升級**。打包更可控，更新更穩定，路徑更確定。

為了讓使用者儘早體驗到新的打包流程，我們仍有一些實驗性質的最佳化策略在驗證中（比如 Windows 使用者資料的生命週期遷移），後續打磨完會單獨分享。

開源的意義不只是把程式碼放出來，更是**把踩坑的過程也分享出去**，讓後來者少走彎路。

## 延伸閱讀

- [Nexu GitHub](https://github.com/nexu-io/nexu) — 開源 OpenClaw 桌面客戶端
- [Harness Engineering Guide](https://harness-guide.com) — 免費開源的 AI Agent 技術知識庫
