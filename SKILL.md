---
name: clayprint
description: "Clayprint 將使用者提供的文字稿做成有故事線的簡報／PowerPoint：先寫每頁判斷，再挑版型與主視覺，輸出可編輯的原生圖表或 SVG。適用於從文字稿製作新簡報。"
---

# Clayprint

把使用者的文字稿整理成 16:9 PowerPoint。交付簡報、對應的 `story.json`、驗證結果與交付說明；以原稿為內容依據。

## 原則

1. 觀點在前，證據在後。
2. 一頁一個清楚的判斷：標題 `claim` 寫結論，主題放頁首小字 `kicker`。
3. 先寫結論，再選最能支持它的圖或版型。
4. 放不下就刪內容或拆頁，不縮字級。

每個版型自帶一個主張；稿子撐不起就換版型，例如沒有支撐數字的摘要改用 `process` 或 `columns`，不需要決定的結尾改用 `list`。各版型的主張、欄位與容量見 [版型說明](references/layouts.md)。

常見骨架是工具箱，不是必填清單：

- 決策型：封面 → 主管摘要 → 證據 → 診斷或方案 → 決議事項。
- 說明型：封面 → 重點摘要 → 拆解 → 流程或時程 → 下一步。

## 資料底線

- 不編造數字；沒有可畫的數字就不放圖表。無日期的流程用 `process`，不捏造月份。
- 0 是觀察值。論證需要、讀者會以為有的數字若未給，在原位標「未提供」，並列入當頁來源列；只是版面有那一格而稿子沒提，就整格省略。缺值輸入與各圖處理方式見 [版型說明](references/layouts.md)和[圖表選單](references/charts.md)。
- 每頁填 `sources.source`；單位、期間只填已知內容。虛構稿註明「虛構示意資料」。推導值的算法與原始數字放當頁 `notes` 或 `sources.more`，格式見 [驗收說明](evals/README.md)。

## 流程

以下指令從 skill 根目錄執行；需要 Node 24.2 以上，缺少 `node_modules` 時執行 `npm ci`。將 `story.json`、`script.md`、`deck.pptx` 換成本次檔名。

1. 讀文字稿，確認聽眾、目的、可用數字、來源與資料缺口。
2. 選合適的骨架，寫故事線和每頁一句結論。
3. 依 [版型說明](references/layouts.md)挑支撐結論的版型；需要圖表時依 [圖表選單](references/charts.md)選圖。
4. 寫 `story.json`，執行 `node evals/check.mjs story.json script.md` 核對結構、數字與建檔。範例：`node evals/check.mjs examples/story.json evals/fixtures/example-script.md`。
5. 執行 `node scripts/pptx.js story.json deck.pptx` 建檔。
6. 逐頁預覽：有 PowerPoint 的 Mac 使用 PowerPoint；沒有 PowerPoint 但有 LibreOffice（`soffice`）時使用 LibreOffice。兩者都執行 `node scripts/preview.js deck.pptx out/preview`，並需要 `pdftoppm`、`ffmpeg`。LibreOffice 可能使用替代字型，預覽只能確認版面，正式字型仍要在 PowerPoint 複查。兩者都沒有時，告知如何安裝 PowerPoint 或 LibreOffice；可依 [圖表預覽指令](references/charts.md#共通欄位與輸出)查看 SVG／PNG，但那只能驗圖表，不能驗整頁版面。
7. 依警告和預覽修正最弱的一頁，再重建、重驗。交付時集中列一次：聽眾要帶走的那句話、缺的資料、時間不夠還沒改好的頁。編輯限制見 [設計差異](docs/design-diff.md)。

## 設計層與驗證

預設 clay 設計層；切換 B′ 深藍範例與檢查自訂配色見 [設計層說明](design/README.md)。逐頁檢查判斷、數字、單位、期間、來源、缺值、遮擋與閱讀順序。驗收器通過只證明結構、數字對照和程式可建檔；獨立驗收見 [有數字稿](evals/with-numbers.md)與[無數字稿](evals/without-numbers.md)。
