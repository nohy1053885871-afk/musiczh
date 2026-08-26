-- 拾音运营后台 数据库 DDL
-- 首次启动时由 db.ts 自动执行（IF NOT EXISTS 幂等）

-- 通用事件表：PV、点击、曝光、状态变更、业务事件全部进这里
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,                  -- 事件时间戳（毫秒，前端 SDK 生成）
  event       TEXT    NOT NULL,                  -- 事件名 snake_case
  visitor_id  TEXT    NOT NULL,                  -- 前端生成的匿名 UUID（localStorage）
  session_id  TEXT    NOT NULL,                  -- 会话 ID（30 分钟无活动重置）
  page        TEXT,                              -- pathname
  ua          TEXT,                              -- 完整 User-Agent
  ip          TEXT,                              -- 客户端 IP（来自 X-Forwarded-For / X-Real-IP）
  app_ver     TEXT,                              -- 主站版本（package.json.version）
  props       TEXT                               -- JSON 字符串：业务字段
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_event_ts ON events(event, ts);
CREATE INDEX IF NOT EXISTS idx_events_visitor_ts ON events(visitor_id, ts);

-- v0.4.1 起新增：events.file_id 生成列 + 索引，由 db.ts 兜底执行（ALTER TABLE ADD COLUMN 不幂等）

-- 失败详情表：解密 / 转码 / 下载失败专用，便于"复制 JSON"排查
CREATE TABLE IF NOT EXISTS failures (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  visitor_id  TEXT    NOT NULL,
  stage       TEXT    NOT NULL,                  -- 'decrypt' | 'transcode' | 'download'
  error_code  TEXT,                              -- 如 INVALID_HEADER / DECRYPT_FAILED
  error_msg   TEXT,
  error_stack TEXT,
  file_name   TEXT,                              -- 完整文件名（用户授权上报）
  file_ext    TEXT,
  file_size   INTEGER,
  source      TEXT,                              -- ncm / kgm / vpr
  ua          TEXT,
  ip          TEXT,
  app_ver     TEXT
);
CREATE INDEX IF NOT EXISTS idx_failures_ts ON failures(ts);
CREATE INDEX IF NOT EXISTS idx_failures_code_ts ON failures(error_code, ts);
CREATE INDEX IF NOT EXISTS idx_failures_stage_ts ON failures(stage, ts);

-- 运营后台首页日汇总。只保存首页所需的稳定统计口径；原始 events 仍是唯一事实源。
CREATE TABLE IF NOT EXISTS overview_daily_metrics (
  day                       INTEGER PRIMARY KEY,
  pv                        INTEGER NOT NULL DEFAULT 0,
  upload_files              INTEGER NOT NULL DEFAULT 0,
  upload_files_legacy       INTEGER NOT NULL DEFAULT 0,
  upload_reject             INTEGER NOT NULL DEFAULT 0,
  dismissed_files           INTEGER NOT NULL DEFAULT 0,
  decrypt_done              INTEGER NOT NULL DEFAULT 0,
  decrypt_fail              INTEGER NOT NULL DEFAULT 0,
  transcode_done            INTEGER NOT NULL DEFAULT 0,
  transcode_fail            INTEGER NOT NULL DEFAULT 0,
  raw_transcode_done        INTEGER NOT NULL DEFAULT 0,
  raw_transcode_fail        INTEGER NOT NULL DEFAULT 0,
  decrypt_abandon           INTEGER NOT NULL DEFAULT 0,
  transcode_abandon         INTEGER NOT NULL DEFAULT 0,
  legacy_files              INTEGER NOT NULL DEFAULT 0,
  download_done             INTEGER NOT NULL DEFAULT 0
);

-- 精确跨日 UV + 区间内最后设备。每个 visitor 每天至多一行。
CREATE TABLE IF NOT EXISTS overview_daily_visitors (
  day          INTEGER NOT NULL,
  visitor_id   TEXT    NOT NULL,
  last_ts      INTEGER NOT NULL,
  browser      TEXT    NOT NULL,
  os           TEXT    NOT NULL,
  device_type  TEXT    NOT NULL,
  has_ua       INTEGER NOT NULL DEFAULT 0,
  has_pageview INTEGER NOT NULL DEFAULT 0,
  has_upload   INTEGER NOT NULL DEFAULT 0,
  has_convert  INTEGER NOT NULL DEFAULT 0,
  has_download INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_overview_daily_visitors_day
  ON overview_daily_visitors(day);

-- upload_attempt 的当前终态；upload_ts 口径与旧 overview 的外层时间范围一致。
CREATE TABLE IF NOT EXISTS overview_file_state (
  file_id     TEXT PRIMARY KEY,
  upload_ts   INTEGER,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('success','failed','abandoned','pending')),
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_overview_file_state_upload_status
  ON overview_file_state(upload_ts, status);

-- 每条 upload_attempt 一行；同一 file_id 因重试/历史重复上报出现多次时仍保持旧口径精确计数。
-- 最终状态来自 overview_file_state，并在下游事件到达时同步更新该 file_id 的全部上传记录。
CREATE TABLE IF NOT EXISTS overview_file_upload_state (
  upload_event_id INTEGER PRIMARY KEY,
  file_id         TEXT    NOT NULL,
  upload_ts       INTEGER NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('success','failed','abandoned','pending')),
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_overview_file_upload_ts_status
  ON overview_file_upload_state(upload_ts, status);
CREATE INDEX IF NOT EXISTS idx_overview_file_upload_file
  ON overview_file_upload_state(file_id);

-- 单行游标。building/disabled 时首页读取原始表；ready 时优先读取汇总。
CREATE TABLE IF NOT EXISTS overview_rollup_state (
  singleton    INTEGER PRIMARY KEY CHECK (singleton = 1),
  last_event_id INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'building'
               CHECK (status IN ('building','ready','disabled')),
  last_run_at  INTEGER,
  last_error   TEXT
);
INSERT OR IGNORE INTO overview_rollup_state
  (singleton, last_event_id, status, last_run_at, last_error)
VALUES (1, 0, 'building', NULL, NULL);

-- 单管理员账号
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  last_login_at INTEGER
);

-- 功能开关 / 配置中心
CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
INSERT OR IGNORE INTO feature_flags (key, value, updated_at)
VALUES (
  'homepage_guidance_visible',
  'true',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);
INSERT OR IGNORE INTO feature_flags (key, value, updated_at)
VALUES (
  'site_access_restricted',
  'false',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

-- 公开站点 IP 访问规则。同一规范化地址只能属于白名单或黑名单之一。
CREATE TABLE IF NOT EXISTS site_access_ip_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  address    TEXT UNIQUE NOT NULL,
  rule       TEXT NOT NULL CHECK (rule IN ('allow', 'deny')),
  note       TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_site_access_ip_rules_rule
  ON site_access_ip_rules(rule);
