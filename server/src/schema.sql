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

-- 单管理员账号
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  last_login_at INTEGER
);

-- 预留：功能开关 / 配置中心（本期不实现）
CREATE TABLE IF NOT EXISTS feature_flags (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
