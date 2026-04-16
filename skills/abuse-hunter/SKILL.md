---
name: abuse-hunter
description: Detect and investigate bulk registration abuse on SaaS platforms. Given access to a user database (or exported CSV/JSON), run a multi-dimensional anomaly analysis — email domain clustering, registration tempo, UA fingerprinting, session structure, usage patterns, and credit consumption — to produce a scored abuse report with actionable recommendations. Use when investigating suspicious sign-up spikes, credit fraud, free-tier abuse, or account farming.
---

# Abuse Hunter — SaaS 批量注册盗刷排查 Skill

一键排查你的 SaaS 平台是否存在批量注册、薅免费额度、账号农场等滥用行为。

## 何时使用

- 发现某个邮箱域名注册量异常高
- 新用户暴增但付费转化率下降
- 免费积分/credit 消耗速度突然加快
- 怀疑存在自动化注册行为

## 排查流程（6 步）

按顺序执行，每一步都会输出中间结论，最终汇总为综合评分。

### Step 1: 邮箱域名聚类

**目标**：找出注册量异常高的邮箱域名

```sql
-- 按邮箱域名统计注册用户数，找出 Top 异常域名
SELECT
  SUBSTRING(email FROM '@(.+)$') AS domain,
  COUNT(*) AS user_count,
  MIN(created_at) AS first_signup,
  MAX(created_at) AS last_signup,
  EXTRACT(EPOCH FROM MAX(created_at) - MIN(created_at)) / 3600 AS span_hours
FROM users
GROUP BY domain
HAVING COUNT(*) > 10
ORDER BY user_count DESC
LIMIT 20;
```

**判定标准**：
- 🔴 单域名 >100 注册 + 域名年龄 <30 天 → 高风险
- 🟡 单域名 50-100 注册 + 注册集中在 <72h 内 → 中风险
- 🟢 单域名 <50 注册 + 分布均匀 → 低风险

**域名背景检查**：
```bash
# WHOIS 查域名创建时间和注册商
whois <domain> | grep -iE "creation|registrar|name server"
# DNS 检查：有没有网站，有没有邮件配置
dig <domain> MX +short
dig <domain> A +short
# 是否有 ICP 备案（仅中国域名）
curl -s "https://api.vvhan.com/api/icp?url=<domain>" | jq .
```

### Step 2: 注册时间模式分析

**目标**：判断注册节奏是自然增长还是批量注入

```sql
-- 按天统计注册量（可疑域名）
SELECT
  DATE(created_at) AS reg_date,
  COUNT(*) AS daily_count
FROM users
WHERE email LIKE '%@<suspect_domain>'
GROUP BY reg_date
ORDER BY reg_date;

-- 按小时统计（找注册高峰）
SELECT
  DATE(created_at) AS reg_date,
  EXTRACT(HOUR FROM created_at) AS reg_hour,
  COUNT(*) AS hourly_count
FROM users
WHERE email LIKE '%@<suspect_domain>'
GROUP BY reg_date, reg_hour
HAVING COUNT(*) > 10
ORDER BY hourly_count DESC;

-- 注册间隔分析（关键！）
WITH ordered AS (
  SELECT created_at,
    LAG(created_at) OVER (ORDER BY created_at) AS prev_at
  FROM users
  WHERE email LIKE '%@<suspect_domain>'
)
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM created_at - prev_at)) AS median_interval_sec,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM created_at - prev_at)) AS p90_interval_sec
FROM ordered
WHERE prev_at IS NOT NULL;
```

**判定标准**：
- 🔴 注册间隔中位数 <60 秒 → 自动化注册
- 🟡 注册间隔中位数 60-300 秒 + 存在明显高峰 → 疑似批量
- 🟢 注册间隔中位数 >300 秒 + 无明显聚集 → 自然注册

**阶段切换检测**：
将注册按时间分段，检查是否存在"前期小量试探 + 后期大量涌入"模式。如果存在，说明攻击者经历了"测试→放量"的阶段。

### Step 3: 邮箱前缀模式分析

**目标**：判断邮箱地址是人工创建还是程序生成

```sql
-- 前缀长度分布
SELECT
  LENGTH(SPLIT_PART(email, '@', 1)) AS prefix_len,
  COUNT(*) AS cnt
FROM users
WHERE email LIKE '%@<suspect_domain>'
GROUP BY prefix_len
ORDER BY cnt DESC;

-- 前缀字符模式分类
SELECT
  CASE
    WHEN SPLIT_PART(email, '@', 1) ~ '^[a-z]+$' THEN 'letters_only'
    WHEN SPLIT_PART(email, '@', 1) ~ '^[0-9]+$' THEN 'digits_only'
    WHEN SPLIT_PART(email, '@', 1) ~ '^[a-z0-9]{6}$' THEN '6char_alnum'
    WHEN SPLIT_PART(email, '@', 1) ~ '^[a-z0-9]{5}$' THEN '5char_alnum'
    ELSE 'other'
  END AS prefix_pattern,
  COUNT(*) AS cnt
FROM users
WHERE email LIKE '%@<suspect_domain>'
GROUP BY prefix_pattern
ORDER BY cnt DESC;
```

**判定标准**：
- 🔴 >80% 为固定长度随机串（如 6 位 alnum）→ 程序生成
- 🟡 多种模式混合但高度集中 → 半自动
- 🟢 长度和模式分布接近正态 → 自然注册

### Step 4: UA 指纹与 Session 结构

**目标**：判断注册环境的多样性

```sql
-- UA 丰富度对比（可疑域名 vs 全量用户）
-- 可疑域名
SELECT
  COUNT(DISTINCT session_id) AS total_sessions,
  COUNT(DISTINCT user_agent) AS unique_uas,
  ROUND(COUNT(DISTINCT user_agent)::NUMERIC / NULLIF(COUNT(DISTINCT session_id), 0), 4) AS ua_diversity
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE u.email LIKE '%@<suspect_domain>';

-- 全量用户（基线）
SELECT
  COUNT(DISTINCT session_id) AS total_sessions,
  COUNT(DISTINCT user_agent) AS unique_uas,
  ROUND(COUNT(DISTINCT user_agent)::NUMERIC / NULLIF(COUNT(DISTINCT session_id), 0), 4) AS ua_diversity
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE u.email NOT LIKE '%@<suspect_domain>';

-- 每用户 session 数分布
SELECT
  u.email LIKE '%@<suspect_domain>' AS is_suspect,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY session_count) AS median_sessions,
  PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY session_count) AS p90_sessions
FROM (
  SELECT user_id, COUNT(*) AS session_count
  FROM sessions GROUP BY user_id
) sc
JOIN users u ON sc.user_id = u.id
GROUP BY is_suspect;
```

**判定标准**：
- 🔴 UA 丰富度比全量用户低一个数量级 → 环境高度收敛
- 🟡 UA 丰富度低但不极端 → 需结合其他维度
- 🟢 UA 分布接近全量用户 → 正常

### Step 5: 使用行为与激活时间

**目标**：判断账号是"注册即用"还是"先备号再启用"

```sql
-- 注册到首次使用的间隔
SELECT
  u.email LIKE '%@<suspect_domain>' AS is_suspect,
  COUNT(*) AS users_with_usage,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM first_usage - u.created_at)
  ) AS median_activation_sec,
  PERCENTILE_CONT(0.9) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM first_usage - u.created_at)
  ) AS p90_activation_sec
FROM users u
JOIN (
  SELECT user_id, MIN(created_at) AS first_usage
  FROM usage_events GROUP BY user_id
) ue ON u.id = ue.user_id
GROUP BY is_suspect;

-- 使用覆盖率
SELECT
  u.email LIKE '%@<suspect_domain>' AS is_suspect,
  COUNT(*) AS total_users,
  COUNT(ue.user_id) AS users_with_usage,
  ROUND(COUNT(ue.user_id)::NUMERIC / COUNT(*), 4) AS usage_rate
FROM users u
LEFT JOIN (
  SELECT DISTINCT user_id FROM usage_events
) ue ON u.id = ue.user_id
GROUP BY is_suspect;
```

**判定标准**：
- 🔴 激活中位数 >1 小时 + 使用覆盖率 <80% → 先备号再启用模式
- 🟡 激活时间偏长但使用率正常 → 需结合其他维度
- 🟢 激活时间和使用率接近全量用户 → 正常

### Step 6: 积分 / Credit 消耗

**目标**：量化实际经济损失

```sql
-- 可疑域名积分消耗汇总
SELECT
  COUNT(*) AS accounts_with_credits,
  SUM(total_granted) AS total_credits_granted,
  SUM(total_consumed) AS total_credits_consumed,
  SUM(total_expired) AS total_credits_expired,
  ROUND(SUM(total_consumed)::NUMERIC / NULLIF(SUM(total_granted), 0), 4) AS consumption_rate
FROM credit_summary cs
JOIN users u ON cs.user_id = u.id
WHERE u.email LIKE '%@<suspect_domain>';

-- 模型调用成本 Top 10
SELECT
  model_name,
  COUNT(*) AS call_count,
  COUNT(DISTINCT user_id) AS unique_users,
  ROUND(SUM(cost_usd)::NUMERIC, 2) AS total_cost
FROM usage_events ue
JOIN users u ON ue.user_id = u.id
WHERE u.email LIKE '%@<suspect_domain>'
GROUP BY model_name
ORDER BY total_cost DESC
LIMIT 10;
```

## 综合评分模型

每个维度 0-2 分，总分 12 分：

| 维度 | 0 分（正常） | 1 分（可疑） | 2 分（高风险） |
|------|-------------|-------------|---------------|
| 域名聚类 | <50 注册 | 50-100 注册 | >100 注册 |
| 注册节奏 | 间隔 >5min | 间隔 1-5min | 间隔 <1min |
| 前缀模式 | 自然分布 | 部分规律 | >80% 固定模式 |
| UA 指纹 | 丰富度正常 | 偏低 | 低一个数量级 |
| 激活时间 | 正常 | 偏慢 | 明显先备后用 |
| 积分消耗 | 低消耗 | 中等 | 大规模薅取 |

**总分判定**：
- 0-3 分：✅ 正常用户群
- 4-7 分：⚠️ 需要持续监控
- 8-12 分：🚨 高度疑似批量滥用，建议立即处置

## 输出格式

排查完成后输出结构化报告：

```
# 滥用排查报告

## 目标域名：xxx.yyy
## 排查时间：YYYY-MM-DD
## 综合评分：X / 12（✅ / ⚠️ / 🚨）

### 各维度评分
| 维度 | 得分 | 关键发现 |
|------|------|---------|
| ... | ... | ... |

### 关键时间线
- Day 1: ...
- Day N: ...

### 影响评估
- 涉及账号数：
- 消耗积分：
- 推理成本：

### 处置建议
1. 即时：...
2. 短期：...
3. 长期：...
```

## 处置建议模板

根据评分自动推荐：

### 8-12 分（高风险）
1. **即时**：冻结该域名所有未使用积分，暂停新注册
2. **短期**：对该域名已有账号做逐一审核，标记可回收积分
3. **长期**：注册流增加以下防线 —
   - 邮箱域名年龄检查（<30 天的新域名需额外验证）
   - 同域名注册频率限制（如每小时 ≤5 个）
   - UA 多样性实时监控
   - 注册间隔异常告警

### 4-7 分（需监控）
1. 建立该域名的监控看板
2. 设置注册量阈值告警
3. 每周复查一次

### 0-3 分（正常）
1. 归档报告，无需处置
2. 保持常规监控

## 适配说明

以上 SQL 基于 PostgreSQL 语法。如果你的数据库是：
- **MySQL**：将 `SUBSTRING(... FROM ...)` 改为 `SUBSTRING_INDEX()`，`PERCENTILE_CONT` 需要用子查询模拟
- **MongoDB**：将 SQL 改为聚合管道（`$group`, `$match`, `$project`）
- **CSV/JSON 导出**：改用 Python pandas 脚本，参见 `scripts/analyze.py`

如果表名或字段名不同，告诉我你的 schema，我会自动适配查询。
