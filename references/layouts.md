# 版型：讓每頁的一句判斷決定畫面

版型是元件庫，不是要依序填滿的表單。先寫每頁 `claim`，再選最能支持它的版型；不必湊齊九種，也不必固定頁數。來源是文字稿，範例只提供結構。

## 整份簡報與共通欄位

根物件包含 `title`（簡報名稱）、`date`（封面右上日期文字）、`author`（檔案作者，可空白）、`pages`（依播放順序排列的頁面陣列）。文字稿沒有日期時省略根層 `date`，封面就不顯示日期。每頁寫 `type`、一句 `claim` 與 `sources.source`；有證據或行動內容時再填對應的 `visual`。

| 欄位 | 用法 |
| --- | --- |
| `type` | `cover`、`summary`、`section`、`statement`、`evidence`、`numbers`、`compare`、`steps`、`close` 之一。 |
| `kicker` | 頁首章節名；封面改作單位名稱。章節尺標由所有非封面頁的 `kicker` 按首次出現去重。 |
| `claim` | 一句可被內容支持的判斷。所有版型的長標題都可用 `\n` 指定斷點，行數估算會照斷點計算並保留標題高度。避免只寫「背景」或「分析結果」。 |
| `note` | 畫面上的副標或補充，只在 `cover`、`section`、`statement`、`evidence` 使用。 |
| `visual` | 按版型使用不同結構。證據頁放圖表 spec，其餘版型使用下表結構。 |
| `sources` | 每頁來源列：`source`（來源名稱）、選用 `unit`、`period`、`more`（字串陣列，放口徑、算法或缺口）。只知道「使用者提供的提案」就據實寫它。 |
| `notes` | 講稿字串或字串陣列，寫進 PowerPoint 講者備註；不在投影片畫面顯示。可交代數字算法與推論限制。 |

`note` 是畫面補充，`notes` 是講稿，兩者用途不同。頁面選用欄位空著時整格不出現：省略 `note`、`metric`、`sources.unit` 等欄位即可，不填空白卡片或無意義佔位字。保留必要的 `claim` 與來源列。資料表或圖表中的 `null` 表示缺值；依圖種可能略去整列、留空格或斷線，不能假定分類仍會畫出。各圖行為見 [圖表欄位說明](charts.md)，缺口會自動列入來源列。

圖表缺值與數字格的 `value: null` 會自動加上「未提供：項目」；其他版型的缺漏與未定事項，請自行寫入 `sources.more`。來源列建議維持兩行，超過會警告且不縮字。`visual.source` 不會代替頁面的 `sources.source`。

## 九種版型

| 版型 | 什麼時候用 | 版面欄位與實作補充 | 容量與限制 |
| --- | --- | --- | --- |
| 封面 `cover` | 建立主張、對象與範圍。 | `kicker`、`claim`、`note`、`sources`；日期讀根層 `date`。 | 深色底；主標可用 `\n` 分兩行，副標以一行為宜。 |
| 主管摘要 `summary` | 先交代建議與支撐決策的關鍵數字。 | `kicker`、`claim`、`visual.lead`、選用 `visual.body`、`visual.items`、`sources`。 | 左欄一行粗體建議與二至三行說明；右欄直排二至三個數字，每項可加一行 `note`。超出容量會警告。 |
| 章節 `section` | 故事進入新的問題，讓觀眾知道位置。 | `kicker`、`claim`、`note`、`sources`；尺標依全份簡報的章節名產生。 | 淡色底；目前章節以 `kicker` 對應尺標，不把章節清單放進 `visual`。 |
| 一句話 `statement` | 需要觀眾先記住一個判斷，或沒有數字可畫。 | `kicker`、`claim`、`note`、`sources`；選用 `focus` 指定 `claim` 內一段原文。 | 只強調第一個相符片段；找不到 `focus` 會警告。補充要短。 |
| 證據 `evidence` | 用一張圖或表支持標題。 | `kicker`、`claim`、`visual`、`note`、`sources`；選用 `metric: {label?, value, unit?}`。 | `visual` 是 [圖表 spec](charts.md)。有 `note` 或 `metric` 時保留右側結論欄；兩者都省略時圖表放寬。一頁一張主圖。 |
| 數字 `numbers` | 並列少數關鍵指標及增減。 | `kicker`、`claim`、`visual.items`、`sources`。 | 由標題下方的內容起點向下排，建議二至四格；超出範圍會警告。過長數字可能縮字並警告，仍須看圖。 |
| 比較 `compare` | 在同一組條件下比較方案並提出建議。 | `kicker`、`claim`、`visual.rows`、`visual.options`、`sources`。 | 建議二至三個方案；方案數量與文字密度以預覽判斷。每個方案的 `values` 與列名逐格對應。 |
| 步驟 `steps` | 已知月份起迄的分階段時程。 | `kicker`、`claim`、`visual.start`、`visual.end`、`visual.phases`、`sources`。 | 日期必須是 `YYYY-MM`，各階段落在整體時程內；適合少數階段，列高不足會警告。 |
| 收尾 `close` | 明確交代接下來做什麼、誰負責、何時完成。 | `kicker`、`claim`、`visual.rows`、`sources`。 | 與封面同色的深色底，任務粗體淺色字、負責人與期限靠右淡色，列間細線；全欄未提供的負責人或期限會省略。文字放不下會警告。 |

所有版型都接受 `notes`。數字格、方案、階段、行動列中的全空物件會整格略去；每個主視覺仍需至少一筆有內容的資料。表中的二至四格、二至三方案是視覺容量建議，警告用來提示看圖，不是要求把真實內容硬湊成指定數量。

表格（原生與 SVG）、比較頁及收尾頁會依可用高度平均放大資料列，最多為原列高的 1.8 倍，字級不變；列多時沿用原有配置。

### 主管摘要的 `visual`

`{lead, body?, items}`。`lead` 必填，寫一行建議；`body` 選填，以二至三行說明理由。`items` 使用下方數字格的相同結構，另可加 `note` 作一行說明。右欄每項依序顯示大數字與單位、粗體短標籤、說明，項目間用細線分隔。建議二至三項，項目數、建議、說明或數字超出容量時會警告；文字仍需逐頁驗收。

### 數字格的 `visual`

```json
{
  "items": [
    { "label": "完成件數", "value": 80, "unit": "件", "prev": 60, "mode": "abs", "digits": 0, "better": "higher", "deltaSuffix": " 件" },
    { "label": "平均等待", "value": 2.5, "unit": "天", "prev": 3.5, "digits": 1, "better": "lower", "deltaSuffix": " 天" }
  ]
}
```

`value` 是數字時可搭 `prev` 算增減；有前期值時明寫 `better: "higher"` 或 `"lower"`。`mode` 預設 `abs`（差額），`pct` 是相對前期的百分比，`pp` 是兩個百分數的百分點差。前期為 0 時自動改差額。`digits` 控制顯示精度，`deltaSuffix` 只作用於差額尾碼。`value` 也可直接是顯示字串，此時不計算增減。缺值保留 `null`，來源列會自動列明未提供的指標；0 仍是有效觀察值。

### 比較頁的 `visual`

`rows` 是列名陣列。`options` 的每項為 `{name, subtitle?, values, recommended?}`，`values` 是與列名等長的文字或數字陣列，缺值用 `null`；`recommended: true` 的欄頭使用實心 focus 色塊，方案名、副標與「建議」為白字，下方各格使用表格強調列的淡色底。未指定建議方案時維持一般欄位外觀。數字若寫在文字裡仍需來自來源。未知資料格填 `null` 保留對應位置，並在 `sources.more` 交代。

### 步驟頁的 `visual`

`{start: "YYYY-MM", end: "YYYY-MM", phases: [{name, note?, from: "YYYY-MM", to: "YYYY-MM"}]}`。起訖月都計入長條。日期來自文字稿，不能為了使用時間軸而補造。沒有日期的純流程可用 `statement` 說明判斷、`compare` 呈現各階段的同一組資訊，或 `close` 列出後續工作；步驟先後寫入文字即可。

### 收尾頁的 `visual`

`{rows: [{task, owner?, due?}]}`。`due` 是顯示文字，可放來源提供的日期或相對時點，不會被轉成日期軸。期限欄以約 6 個中文字內為宜；較長的期限改寫成原稿支持的條件（例如「試走後」），或移到講稿 `notes`。未知的負責人與期限留空，在 `sources.more` 寫明未提供。

## 完整 story.json 結構範例

下面可直接存為 `story.json` 後建檔。這是虛構圖書館的 API 示意，涵蓋九種版型；實際故事只挑需要的頁。更完整的現有資料範例在 [examples/story.json](../examples/story.json)。

```json
{
  "title": "青嶼圖書館預約流程改善",
  "date": "2026 年 3 月",
  "author": "",
  "pages": [
    {
      "type": "cover",
      "kicker": "青嶼圖書館",
      "claim": "預約流程改善\n從確認通知開始",
      "note": "先處理交接資訊，再檢查等待時間",
      "sources": { "source": "虛構示意提案" },
      "notes": "說明提案範圍與本次需要確認的決定。"
    },
    {
      "type": "summary",
      "kicker": "主管摘要",
      "claim": "先統一確認通知，追蹤件數與等待時間",
      "visual": {
        "lead": "先試行統一確認通知",
        "body": "讓狀態與負責窗口保持一致。\n以件數與等待時間追蹤試行結果。",
        "items": [
          { "label": "東館完成件數", "value": 80, "unit": "件", "note": "用來追蹤服務量" },
          { "label": "東館平均等待", "value": 2.5, "unit": "天", "digits": 1, "note": "用來追蹤處理時間" }
        ]
      },
      "sources": { "source": "虛構示意紀錄與提案", "period": "2026 年 2 月" }
    },
    {
      "type": "section",
      "kicker": "現況",
      "claim": "現況顯示交接需要改善",
      "note": "先確認問題，再選做法",
      "sources": { "source": "虛構示意提案" }
    },
    {
      "type": "statement",
      "kicker": "現況",
      "claim": "先統一確認通知，讓交接資訊完整",
      "focus": "統一確認通知",
      "note": "把狀態與負責窗口寫在同一則訊息裡。",
      "sources": { "source": "虛構示意訪談" }
    },
    {
      "type": "evidence",
      "kicker": "現況",
      "claim": "東館完成預約件數高於西館",
      "visual": {
        "kind": "rank",
        "focus": "東館",
        "rows": [
          { "label": "東館", "value": 80 },
          { "label": "西館", "value": 60 }
        ]
      },
      "metric": { "label": "件數差距", "value": "20", "unit": "件" },
      "note": "件數差異不能單獨證明服務效率差異。",
      "sources": { "source": "虛構示意紀錄", "unit": "件", "period": "2026 年 2 月" },
      "notes": "件數差距算法：80 - 60 = 20；尚未比較兩館需求量。"
    },
    {
      "type": "numbers",
      "kicker": "現況",
      "claim": "完成件數增加，平均等待縮短",
      "visual": {
        "items": [
          { "label": "東館完成件數", "value": 80, "unit": "件", "prev": 60, "better": "higher", "deltaSuffix": " 件" },
          { "label": "東館平均等待", "value": 2.5, "unit": "天", "prev": 3.5, "digits": 1, "better": "lower", "deltaSuffix": " 天" }
        ]
      },
      "sources": { "source": "虛構示意紀錄", "period": "2026 年 2 月", "more": ["增減對比同年 1 月"] }
    },
    {
      "type": "compare",
      "kicker": "行動",
      "claim": "先試行統一通知，較容易維持窗口一致",
      "visual": {
        "rows": ["做法", "主要風險"],
        "options": [
          { "name": "分館各自通知", "values": ["各館維護通知內容", "資訊格式可能不同"] },
          { "name": "統一通知", "subtitle": "共用通知內容", "values": ["同一窗口整理狀態", "需維護共用內容"], "recommended": true }
        ]
      },
      "sources": { "source": "虛構示意提案" },
      "notes": "推薦理由是交接一致性，仍需確認各館是否有特殊情境。"
    },
    {
      "type": "steps",
      "kicker": "行動",
      "claim": "先試行再檢討，逐階段確認通知內容",
      "visual": {
        "start": "2026-04",
        "end": "2026-06",
        "phases": [
          { "name": "整理共用通知", "note": "確認窗口", "from": "2026-04", "to": "2026-04" },
          { "name": "分館試行與檢討", "from": "2026-05", "to": "2026-06" }
        ]
      },
      "sources": { "source": "虛構示意時程", "unit": "月", "period": "2026 年 4 至 6 月" }
    },
    {
      "type": "close",
      "kicker": "行動",
      "claim": "先確認共用通知內容，再啟動試行",
      "visual": {
        "rows": [
          { "task": "確認通知內容", "owner": "服務組", "due": "試行前" },
          { "task": "彙整試行回饋", "owner": "分館窗口", "due": "試行結束後" }
        ]
      },
      "sources": { "source": "虛構示意提案" }
    }
  ]
}
```

```sh
node scripts/pptx.js story.json deck.pptx
```

輸出警告表示要看圖判斷：先查標籤、文字密度、來源列、資料口徑與缺值，再改最弱的一頁。建檔成功證明檔案能產生；字級、重疊、圖文關係與故事是否成立，仍須由預覽逐頁驗收。
