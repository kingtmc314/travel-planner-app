# 航班狀態背景檢查 — v9.3

目前已完成 `POST /api/scheduled/flight-status`，但沒有建立 Heartbeat 排程或排程設定紀錄。App 可見時只檢查本人已自願追蹤的航班，每五分鐘一次；通知只出現在 App 通知中心，不是 iPhone 背景推送、電郵或 SMS。

## 啟用前提

先保存 checkpoint、推送 GitHub，並由使用者確認已發佈包含此回調的版本。必須核實正式端點已更新，再使用專案原生 Heartbeat。不可用 sandbox 常駐程序、setInterval 或 node-cron 代替。

排程名稱應固定且唯一（例如 `voyage-flight-status-v93`），週期採六欄 UTC cron `0 */5 * * * *`；每五分鐘的間隔不因香港時區改變。回調固定為 `/api/scheduled/flight-status`。先查閱 `manus-heartbeat create --help` 和既有排程以免重複建立。將服務真正回傳的 task UID 綁定到 `flight_status_schedule` 的唯一設定行 `id=1`、`schedule_cron_task_uid`，最後才設 `enabled=true`。不得臆造 task UID；不得使用 request body 指定使用者、航班或任務。

回調僅信任 `sdk.authenticateRequest` 驗證的 `isCron`、`taskUid`，再按 task UID 讀取已啟用設定。每批最多 50 個最久未檢查的已選追蹤，工作時間最多約 110 秒；只向機場來源查詢香港日期當日前後一天，其餘記錄更新檢查時間但不查詢來源。每次都重查行程成員權限或本人護照所有权。若來源被刪除或邀請撤回，停用並清除該追蹤的觀測資料。

## 驗證與暫停

啟用後先核對 Heartbeat 執行紀錄及回調結果，只有真實 fresh 狀態／閘口等欄位變更才產生本人通知。第一次有效觀測是基線，不提醒。日期、來源更新時間、缺少資料、過期及 API 錯誤不會被當成抵達或取消；同時重試的交易不能重複通知。

暫停時先將設定 `enabled=false`，再按真正 task UID 暫停平台排程；正在執行的回調也會重查此設定。不可刪除既有行程、費用、住宿、護照航班或通知。

來源：香港機場管理局及 DATA.GOV.HK，https://data.gov.hk/en-data/dataset/aahk-team1-flight-info 。免費公開端點僅在已回傳日期及 HKG 航段上提供資料；官方文件只保證前一天，當日行為是實測的實驗性功能，沒有及時性保證。
