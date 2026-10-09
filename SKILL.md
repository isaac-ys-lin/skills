---
name: blueprint
description: "將使用者提供的文字稿做成有故事線的簡報／PowerPoint：先寫每頁判斷，再挑版型與主視覺，輸出可編輯的原生圖表或 SVG。適用於從文字稿製作新簡報。"
---

# Blueprint

把文字稿整理成觀眾看得懂、能據以決定下一步的 PowerPoint。交付一份完整簡報、對應的 story.json 與驗證結果。

## 適用範圍

製作新的 16:9 簡報，使用八種版型、十三種圖與表格；原生圖可改資料，其餘為 SVG 加 PNG 後備。現階段不處理既有檔案換版、HTML 報告、Word 或 Excel 輸出。以使用者文字稿為內容依據，不擴張成自行補資料的研究任務。

## 資料底線

- 不編造數字；文字稿裡沒有可畫的數字就不放圖表。提案與流程可用文字判斷、方案比較及行動表，也不替無日期的流程捏造時程。
- 0 是觀察值；缺資料用 `null` 留空，寫進來源列。每頁都填 `sources.source`；單位、期間僅填已知內容。虛構稿註明「虛構示意資料」。
- 推導值保留算法與原始數字；合計、差額寫在當頁 `notes` 或 `sources.more`，格式見 [驗收說明](evals/README.md)。

## 少數原則

- 先有判斷，再找支撐它的主視覺；每頁回答一個問題，標題寫結論。
- 範本是元件庫，不是表單。有內容才放那一格；補充文字放 `note`，完整講稿放 `notes`。
- 沿用 Blueprint 的色彩職務、字級與留白；警告是看圖判斷的線索，不是硬改的命令。版面擁擠仍可輸出，只有資料或結構使畫面無法成立時才中止建檔。

## 流程

以下指令從這個 skill 的根目錄執行，需要 Node 24.2 以上；沒有 `node_modules` 時先執行 `npm ci`。`story.json`、`script.md`、`deck.pptx` 是本次工作的輸入／輸出檔名，請換成實際路徑。

1. 讀文字稿，辨認對象、目的、可用數字與來源缺口。
2. 寫故事線：每頁一句判斷，讓前一頁自然帶到下一頁。
3. 每頁挑版型與主視覺。讀 [版型與 story 結構](references/layouts.md)；需要圖表時，依問題查 [圖表選單](references/charts.md)，取對應範例改成原稿資料。
4. 寫 `story.json`，用 `node evals/check.mjs story.json script.md` 核對結構、數字與建檔；完整可跑範例是 `node evals/check.mjs examples/story.json evals/fixtures/example-script.md`。
5. 輸出：`node scripts/pptx.js story.json deck.pptx`。
6. 在有 PowerPoint 且可操作它的 Mac，以 `node scripts/preview.js deck.pptx out/preview` 逐頁看圖（也需要現有的 `pdftoppm`、`ffmpeg`）。其他環境先建立工作資料夾（例如 `mkdir -p out`），將證據頁的 `visual` 另存為 `out/圖表.json`，執行 `node scripts/svg.js out/圖表.json out/圖表.svg`，再用 `node scripts/png.js out/圖表.svg out/圖表.png` 轉圖並開啟 PNG 檢查。可先跑 `node scripts/svg.js examples/rank.json out/rank.svg` 與 `node scripts/png.js out/rank.svg out/rank.png` 確認工具可用。SVG／PNG 只驗圖表，不代表投影片版面已驗收。
7. 依警告與預覽，改最弱的一頁，再重建與核對。沒有警告也無法預覽 PowerPoint 時，挑畫面內容最難支持標題判斷的一頁；仍難區分時，先看空格最多或來源列最長的一頁。交件列出警告、資料缺口及沒做到的地方；編輯限制見 [設計差異](docs/design-diff.md)。

## 驗證

逐頁核對判斷、數字、單位、期間與來源，檢查缺值、遮擋、標籤及閱讀順序。驗收器通過只證明結構與數字對照、程式可建檔；不能證明判斷正確或 PowerPoint 顯示正常。獨立驗收使用 [有數字稿](evals/with-numbers.md) 與 [無數字稿](evals/without-numbers.md)，各有對應清單。
