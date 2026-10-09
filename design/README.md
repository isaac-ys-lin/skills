# Clayprint 設計層

Clayprint 的視覺規格。預設使用 clay 配色，原本的 B′ 深藍保留為第二套設計層範例；顏色、字級、邊界、線寬與斜線填色都由設計層提供。

- `tokens.json`：預設的 clay 設計層。
- `tokens.blue.json`：原本的 B′ 深藍設計層範例。
- `spec.md`：頁面格線、字級、線寬、刻度、來源列、標註規則、資料顯示、版型與 PowerPoint 輸出對應；色碼保留原始設計紀錄。
- `claude-design/`：第一版在 Claude Design 製作的 8 頁版型與 13 種圖表樣張，保留原始名稱與檔名。要在 Claude Design 裡打開才看得到畫面；匯出時附帶的執行檔沒有放進來。

從 repo 根目錄執行；`CLAYPRINT_TOKENS` 可指定另一份設計層，相對路徑從目前工作目錄解析：

```sh
node scripts/pptx.js examples/story.json out/story.pptx
CLAYPRINT_TOKENS=design/tokens.blue.json node scripts/pptx.js examples/story.json out/story-blue.pptx
node scripts/check-design.js
node scripts/check-design.js design/tokens.blue.json
npm test
```

`node scripts/check-design.js [tokens.json]` 省略檔案時檢查目前生效的設計層；明確指定檔案則只檢查該檔。檢查涵蓋文字對比、標籤可讀性、焦點與類別的色差、色盲模擬，以及有序配色的明暗與色相。警告會列出需要直接標值或表格的情況；有失敗時結束碼為 1，通過為 0。`npm test` 同時要求 clay 與 blue 通過設計層檢查。

範例資料都是虛構的「河港市共享單車」。
