# 版型：先寫判斷，再選畫面

每個版型自帶一個主張。先寫每頁 `claim`，再選能支撐它的版型；稿子撐不起主張時換版型。版型是工具箱，不必湊齊，也不必固定頁數。決策型範例見 [story.json](../examples/story.json)，說明型範例見 [story-explain.json](../examples/story-explain.json)。

## 整份簡報與共通欄位

根物件有 `title`、選用的 `date`、`author` 和依播放順序排列的 `pages`。沒有日期就省略 `date`，封面不顯示日期。每頁填 `type`、一句 `claim` 與 `sources.source`；有內容才填該版型的選用欄位。

| 欄位 | 用法 |
| --- | --- |
| `kicker` | 頁首主題；封面作單位名稱。章節尺標按非封面頁的 `kicker` 首次出現順序去重。 |
| `claim` | 可由內容支持的結論。長標題可用 `\n` 指定斷點；不要只寫「背景」或「分析結果」。 |
| `lede` | 封面、章節以外的內容頁選填，一行小字放在標題下、內容上，交代「指標・範圍・期間・單位」。省略時不佔高度。 |
| `note` | 畫面上的補充，適用於 `cover`、`section`、`statement`、`evidence`。 |
| `visual` | 依版型放圖表或結構化內容；欄位見下表。 |
| `sources` | 每頁來源列：`source` 必填；已知時填 `unit`、`period`；`more` 是口徑、算法或缺口的字串陣列。 |
| `notes` | 講者備註，可為字串或字串陣列，不在畫面顯示。 |

`note` 是畫面補充，`notes` 是講稿。選填格若稿子沒有提及，省略整格；不要填空白卡片或佔位字。論證需要、讀者會以為有的數字若未提供，數字格或比較格用 `null` 保留位置，畫面標「未提供」並列入來源列；`0` 是有效觀察值。證據頁的 `table` 圖種也在缺值格原位標「未提供」。其他圖表的 `null` 可能留白、斷線或略去圖元，依[圖表選單](charts.md)處理並列入來源列；若缺值位置本身是論證重點，改用能在原位標示的數字、比較或表格版型。來源列建議兩行內，超出會警告而不縮字。圖表 `visual.source` 不能代替頁面的 `sources.source`。

## 版型與各自的主張

下表容量是畫面建議；超出會警告，應看圖後刪內容或拆頁。所有版型都接受 `notes`，所有內容頁都可填 `lede`。

| 版型 | 自帶的主張 | `visual` 與容量 |
| --- | --- | --- |
| 封面 `cover` | 這份簡報要談的問題與方向。 | 無；用 `kicker`、`claim`、`note`，日期讀根層 `date`。主標可用 `\n` 分行。 |
| 主管摘要 `summary` | 建議這樣做，關鍵數字支持它。 | `{lead, body?, items}`；左欄一行建議和至多三行理由，右欄建議 2～3 個數字格。 |
| 章節 `section` | 接下來處理這個問題。 | 無；用 `kicker`、`claim`、`note`。 |
| 一句話 `statement` | 先記住這個判斷。 | 無；選用頁面 `focus` 指定 `claim` 中的原文，找不到會警告。 |
| 證據 `evidence` | 這張圖或表支持標題判斷。 | 一張[圖表](charts.md)；選用頁面 `metric: {label?, value, unit?}` 和 `note` 作右側結論欄。 |
| 數字 `numbers` | 這幾個指標一起說明狀態。 | `items: [{label, value, unit?, ...}]`；建議 2～4 格，過長數字與高度會警告。 |
| 診斷清單 `list` | 這幾件事有先後，先處理這個。 | `items` 3～5 項；`focus` 選一項，列間細線。 |
| 無日期流程 `process` | 事情照這個順序走，現在在這一步。 | `steps` 3～6 步；`focus` 標目前步驟，超出欄寬會警告。 |
| 核心數字 `kpi` | 這一個數字最重要。 | `main` 含 1～3 個 `benchmarks`，`secondary` 0～4 個。 |
| 因果 `flow` | A 加 B 造成 C，所以做 D。 | `nodes` 2～5 個，`connectors` 連接相鄰方框；預設強調最後一框。 |
| 並列重點 `columns` | 這幾件事並列，不分先後。 | `items` 2～4 欄，選用 `focus` 強調一欄。 |
| 方案比較 `compare` | 在同一組條件下，這個方案較適合。 | `rows` 列名及 `options` 2～4 個方案；每個 `values` 與列名逐格對應。超出 2～4 個才警告。 |
| 月份時程 `steps` | 已知的工作照這段月份安排。 | `start`、`end`、`phases`；日期必須是 `YYYY-MM`，列高不足會警告。 |
| 決議事項 `close` | 下一步由誰做什麼、何時完成。 | `rows: [{task, owner?, due?}]`；列高不足會警告。 |

### 摘要、數字與核心數字

`summary.visual` 為 `{lead, body?, items}`；`lead` 必填，`body` 選填，`items` 使用 `numbers` 的數字格結構並可加一行 `note`。右欄每項顯示數字、標籤與補充，列間用細線。若沒有支撐建議的數字，改用 `process` 或 `columns`。

`numbers.visual.items` 的每項是 `{label, value, unit?, prev?, mode?, digits?, better?, deltaSuffix?}`。`value` 可為數字、顯示字串或 `null`；數字依 `digits` 格式化。四格時使用設計層較小的固定數字字級，過長仍警告而不自動縮字。數字搭 `prev` 時可算增減，須明寫 `better: "higher"` 或 `"lower"`；`mode` 預設 `abs`（差額），另有 `pct`（相對百分比）、`pp`（百分點）。前期為 0 時改用差額；字串值不計算增減。

`kpi.visual` 為 `{main: {label, value, unit?, digits?, benchmarks: [{label, value, unit?, digits?}]}, secondary?: [{label, value, unit?, digits?}]}`。主數字在左，1～3 個對照逐列置於下方，右側直排 0～4 個次要指標。每個 `value` 可為數字或顯示字串，數字依該項的 `digits` 格式化；論證必要但缺值時可用 `null`，畫面標「未提供」並列入來源列。

### 診斷、無日期流程、因果與並列

`list.visual` 為 `{items: [{tag?, heading, body?, note?}], focus?}`。`items` 建議 3～5 項：左欄短標 `tag`、中欄粗體 `heading` 與一行 `body`、右欄一行小字 `note`；列間細線。`focus` 是從 0 起算的項目索引，只讓該列 `tag` 與 `heading` 用重點色。選填文字沒有內容就省略該格。

`process.visual` 為 `{steps: [{label?, heading, body?}], focus?}`。`steps` 建議 3～6 步，從左到右以細線串起圓點；上方小字 `label` 省略時顯示「步驟 1」等，下方放粗體 `heading` 和 `body`。`focus` 是從 0 起算的目前步驟索引，該步圓點與文字用重點色。已有月份的時程使用 `steps` 版型。

`flow.visual` 為 `{nodes: [{label?, heading, body?}], connectors?, focus?, note?}`。`nodes` 建議 2～5 個方框，由左到右閱讀；`connectors` 是長度比方框少一的符號陣列，每段預設「→」，可用「＋」或「＝」。`focus` 是從 0 起算的方框索引，預設最後一個，該框填滿重點色並使用設計層對應文字色。`note` 是方框下一行補充；節點選填格省略時不留佔位。

`columns.visual` 為 `{items: [{kicker?, value?, unit?, digits?, heading, body?}], focus?}`。`items` 建議 2～4 欄：每欄上緣細線、小字 `kicker`、可選大數字 `value`、粗體 `heading` 與 `body`。`value` 是數字時依 `digits` 格式化；`focus` 是從 0 起算的欄索引，省略時各欄同重。

### 方案、月份與行動

`compare.visual.rows` 是比較項目字串陣列；`options` 每項為 `{name, subtitle?, values, recommended?}`。`values` 長度等於 `rows`，文字或數字逐格對應，缺少論證必要的比較值用 `null`，該格顯示「未提供」並進來源列。`recommended: true` 的欄頭填重點色；省略時方案同重。4 個方案仍需檢查文字是否放得下。

`steps.visual` 為 `{start: "YYYY-MM", end: "YYYY-MM", phases: [{name, note?, from: "YYYY-MM", to: "YYYY-MM"}]}`。起訖月都計入長條；每階段須在整體時程內。沒有來源日期就改用 `process`。

`close.visual` 為 `{rows: [{task, owner?, due?}]}`。`due` 是顯示文字，可放來源提供的日期或相對時點，不轉成日期軸。若稿子未提負責人或期限，整欄可省略；若責任歸屬是決策必需的缺口，在 `sources.more` 寫明。收尾若不需要決定，改用 `list`。

表格、比較頁及收尾頁會依可用高度調整資料列，字級不變。若文字仍放不下，刪內容或拆頁。建檔成功只證明檔案能產生；字級、重疊、圖文關係與故事是否成立，仍須逐頁預覽驗收。
