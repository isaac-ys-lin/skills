# 文字稿 → HTML 報告

報告供讀者連續閱讀、轉寄與列印；先寫清楚每節判斷，再選擇能支撐它的段落、表格或圖。範本 [assets/report.html](../assets/report.html) 是元件庫，不是要逐格填滿的表單。只保留有內容的元件，刪掉其餘整段；需要但原稿沒給的資料，在原位標「未提供」。完整示例見 [examples/report.html](../examples/report.html)，原稿見 [explain-script.md](../evals/fixtures/explain-script.md)。

## 流程

1. 讀原稿，寫下讀者要帶走的一句話；替每節先寫一句判斷。確認對象、單位、期間、來源與缺口，不補造數字。
2. 從元件庫組成報告：封面、必要時的目錄與摘要，再依判斷接章節、段落、表格、清單、流程、決議事項。摘要左側放建議，右側只放支撐它的數字。
3. 有數據才放圖。每張圖的輸入另存 JSON；用 `node scripts/svg.js chart.json out/chart.svg --bare --width 6.8` 產生文件版面圖，將 SVG 內嵌到 `<figure>`。`--bare` 不畫圖內標題及來源列，終端印出的單位、期間、來源與附註要寫入 `figcaption`。自動刻度或衍生標籤若不在原稿、也無同節算式，需從圖中移除或補足可核對的算式；數字、圖說與正文引用要一致。無數字時使用段落、清單或流程。
4. 執行 `node evals/check-report.mjs report.html script.md`，核對可見文字與 SVG 數字、未填範本標記及每圖來源。範例：`node evals/check-report.mjs examples/report.html evals/fixtures/explain-script.md`。
5. 要列印就依下列指令輸出 PDF 並逐頁看 PDF，檢查分頁、圖表與表格有無切斷；要轉寄就用瀏覽器看手機寬度，檢查閱讀順序與表格橫向捲動。驗收器無法代替視覺檢查。
6. 交付 HTML 與每張圖的輸入 JSON。和簡報一樣，交付說明集中列出：讀者要帶走的那句話、缺的資料、時間不夠還沒修好的地方。

報告與簡報共用目前生效的設計層。預設為 clay；複製範本後執行 `node scripts/theme-css.js report.html` 可同步樣式。使用 `CLAYPRINT_TOKENS=design/tokens.blue.json node scripts/theme-css.js report.html` 可換成 blue；圖也要用同一設計層重產。沒有檔名時，`node scripts/theme-css.js` 會把 CSS 印到終端。

範例兩圖的資料分別在 [時間圖 JSON](../examples/report-time.json) 與 [品質圖 JSON](../examples/report-quality.json)；內嵌 SVG 只顯示原稿數字，省去自動刻度。範例圖形的色彩由報告 CSS 變數控制，切換設計層時會一起換色。一般從 `scripts/svg.js` 產生的 SVG 已帶入該次生效的顏色，切換設計層後須重產圖。

## 列印 PDF

以下從 repo 根目錄執行，會把範例報告印到 `out/report.pdf`。正式交付時換成自己的 HTML 檔名。使用 Chrome 的列印引擎即可，不需要另寫瀏覽器自動化程式。

macOS：

```sh
mkdir -p out
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$PWD/out/report.pdf" "file://$PWD/examples/report.html"
```

一般系統擇一：

```sh
google-chrome --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$PWD/out/report.pdf" "file://$PWD/examples/report.html"
chromium --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$PWD/out/report.pdf" "file://$PWD/examples/report.html"
```

印完逐頁檢查，尤其留意多頁表格、圖說與圖是否分離，以及封面與章節開頭的位置。轉寄前在手機寬度看一次；寬表格應在自己的容器內橫向捲動，頁面本身不應橫向溢出。
