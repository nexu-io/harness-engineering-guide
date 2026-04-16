#!/usr/bin/env python3
"""
Abuse Hunter — CSV/JSON 离线分析脚本

用法：
  python analyze.py --users users.csv --sessions sessions.csv --usage usage.csv --domain suspect.com

输入文件格式要求（CSV，最少列）：
  users.csv:     id, email, created_at
  sessions.csv:  user_id, session_id, user_agent, created_at
  usage.csv:     user_id, model_name, created_at, cost_usd (可选)

如果你只有 users.csv 也能跑前 3 步（域名聚类 + 注册节奏 + 前缀模式）。
"""

import argparse
import re
import sys
from collections import Counter
from datetime import datetime

import pandas as pd
import numpy as np


def load_csv(path):
    if not path:
        return None
    return pd.read_csv(path, parse_dates=[c for c in pd.read_csv(path, nrows=0).columns if 'at' in c.lower() or 'time' in c.lower()])


def extract_domain(email):
    if pd.isna(email) or '@' not in str(email):
        return None
    return str(email).split('@')[1].lower()


def extract_prefix(email):
    if pd.isna(email) or '@' not in str(email):
        return None
    return str(email).split('@')[0].lower()


def classify_prefix(prefix):
    if not prefix:
        return 'unknown'
    if re.match(r'^[a-z]+$', prefix):
        return 'letters_only'
    if re.match(r'^[0-9]+$', prefix):
        return 'digits_only'
    if re.match(r'^[a-z0-9]{6}$', prefix):
        return '6char_alnum'
    if re.match(r'^[a-z0-9]{5}$', prefix):
        return '5char_alnum'
    return 'other'


def score_dimension(name, value, thresholds):
    """Return 0/1/2 based on thresholds = [(max_for_0, max_for_1)]"""
    lo, hi = thresholds
    if value <= lo:
        return 0
    elif value <= hi:
        return 1
    return 2


def step1_domain_clustering(users_df):
    print("\n" + "="*60)
    print("STEP 1: 邮箱域名聚类")
    print("="*60)

    users_df['domain'] = users_df['email'].apply(extract_domain)
    domain_stats = users_df.groupby('domain').agg(
        user_count=('id', 'count'),
        first_signup=('created_at', 'min'),
        last_signup=('created_at', 'max'),
    ).sort_values('user_count', ascending=False).head(20)

    domain_stats['span_hours'] = (domain_stats['last_signup'] - domain_stats['first_signup']).dt.total_seconds() / 3600

    print(domain_stats.to_string())
    return domain_stats


def step2_registration_tempo(users_df, domain):
    print("\n" + "="*60)
    print(f"STEP 2: 注册时间模式 — @{domain}")
    print("="*60)

    suspect = users_df[users_df['email'].str.contains(f'@{domain}', case=False, na=False)].sort_values('created_at')

    # Daily counts
    daily = suspect.groupby(suspect['created_at'].dt.date).size()
    print("\n按天注册量：")
    print(daily.to_string())

    # Registration intervals
    intervals = suspect['created_at'].diff().dt.total_seconds().dropna()
    if len(intervals) > 0:
        median_interval = intervals.median()
        p90_interval = intervals.quantile(0.9)
        print(f"\n注册间隔中位数：{median_interval:.1f} 秒")
        print(f"注册间隔 P90：{p90_interval:.1f} 秒")

        score = score_dimension('tempo', median_interval, (300, 60))
        # Reverse: lower interval = higher risk
        score = 2 - score
        return score, median_interval
    return 0, None


def step3_prefix_pattern(users_df, domain):
    print("\n" + "="*60)
    print(f"STEP 3: 邮箱前缀模式 — @{domain}")
    print("="*60)

    suspect = users_df[users_df['email'].str.contains(f'@{domain}', case=False, na=False)]
    suspect = suspect.copy()
    suspect['prefix'] = suspect['email'].apply(extract_prefix)
    suspect['pattern'] = suspect['prefix'].apply(classify_prefix)

    pattern_dist = suspect['pattern'].value_counts()
    print("\n前缀模式分布：")
    print(pattern_dist.to_string())

    top_pattern_pct = pattern_dist.iloc[0] / len(suspect) * 100
    print(f"\n最常见模式占比：{top_pattern_pct:.1f}%")

    if top_pattern_pct > 80:
        return 2
    elif top_pattern_pct > 50:
        return 1
    return 0


def step4_ua_fingerprint(users_df, sessions_df, domain):
    if sessions_df is None:
        print("\n⚠️  STEP 4 跳过：未提供 sessions 数据")
        return 0

    print("\n" + "="*60)
    print(f"STEP 4: UA 指纹与 Session 结构 — @{domain}")
    print("="*60)

    suspect_ids = set(users_df[users_df['email'].str.contains(f'@{domain}', case=False, na=False)]['id'])
    other_ids = set(users_df['id']) - suspect_ids

    s_suspect = sessions_df[sessions_df['user_id'].isin(suspect_ids)]
    s_other = sessions_df[sessions_df['user_id'].isin(other_ids)]

    sus_ua = s_suspect['user_agent'].nunique()
    sus_sessions = len(s_suspect)
    oth_ua = s_other['user_agent'].nunique()
    oth_sessions = len(s_other)

    sus_diversity = sus_ua / max(sus_sessions, 1)
    oth_diversity = oth_ua / max(oth_sessions, 1)

    print(f"可疑域名：{sus_sessions} sessions, {sus_ua} 种 UA, 丰富度 {sus_diversity:.4f}")
    print(f"全量用户：{oth_sessions} sessions, {oth_ua} 种 UA, 丰富度 {oth_diversity:.4f}")
    print(f"丰富度比值：{sus_diversity / max(oth_diversity, 0.0001):.2f}x")

    ratio = sus_diversity / max(oth_diversity, 0.0001)
    if ratio < 0.1:
        return 2
    elif ratio < 0.5:
        return 1
    return 0


def step5_activation(users_df, usage_df, domain):
    if usage_df is None:
        print("\n⚠️  STEP 5 跳过：未提供 usage 数据")
        return 0

    print("\n" + "="*60)
    print(f"STEP 5: 激活时间 — @{domain}")
    print("="*60)

    first_usage = usage_df.groupby('user_id')['created_at'].min().rename('first_usage')
    merged = users_df.merge(first_usage, left_on='id', right_index=True, how='left')

    for label, mask in [('可疑域名', merged['email'].str.contains(f'@{domain}', case=False, na=False)),
                         ('全量用户', ~merged['email'].str.contains(f'@{domain}', case=False, na=False))]:
        subset = merged[mask].dropna(subset=['first_usage'])
        if len(subset) > 0:
            activation = (subset['first_usage'] - subset['created_at']).dt.total_seconds()
            total = len(merged[mask])
            with_usage = len(subset)
            print(f"\n{label}：")
            print(f"  使用覆盖率：{with_usage}/{total} = {with_usage/total*100:.1f}%")
            print(f"  激活中位数：{activation.median():.0f} 秒 ({activation.median()/3600:.1f} 小时)")

    return 1  # Simplified scoring


def step6_credits(users_df, usage_df, domain):
    if usage_df is None or 'cost_usd' not in usage_df.columns:
        print("\n⚠️  STEP 6 跳过：未提供成本数据")
        return 0

    print("\n" + "="*60)
    print(f"STEP 6: 积分 / 成本 — @{domain}")
    print("="*60)

    suspect_ids = set(users_df[users_df['email'].str.contains(f'@{domain}', case=False, na=False)]['id'])
    sus_usage = usage_df[usage_df['user_id'].isin(suspect_ids)]

    total_cost = sus_usage['cost_usd'].sum()
    total_calls = len(sus_usage)
    unique_users = sus_usage['user_id'].nunique()

    print(f"总调用次数：{total_calls}")
    print(f"使用账号数：{unique_users}")
    print(f"总成本：${total_cost:.2f}")

    if 'model_name' in sus_usage.columns:
        print("\n模型成本 Top 5：")
        top_models = sus_usage.groupby('model_name').agg(
            calls=('user_id', 'count'),
            cost=('cost_usd', 'sum')
        ).sort_values('cost', ascending=False).head(5)
        print(top_models.to_string())

    if total_cost > 500:
        return 2
    elif total_cost > 100:
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description='Abuse Hunter — SaaS 批量注册排查')
    parser.add_argument('--users', required=True, help='用户表 CSV (id, email, created_at)')
    parser.add_argument('--sessions', help='Session 表 CSV (user_id, session_id, user_agent, created_at)')
    parser.add_argument('--usage', help='Usage 表 CSV (user_id, model_name, created_at, cost_usd)')
    parser.add_argument('--domain', required=True, help='待排查的邮箱域名')
    args = parser.parse_args()

    users = load_csv(args.users)
    sessions = load_csv(args.sessions)
    usage = load_csv(args.usage)

    scores = {}

    step1_domain_clustering(users)

    score2, interval = step2_registration_tempo(users, args.domain)
    scores['注册节奏'] = score2

    scores['前缀模式'] = step3_prefix_pattern(users, args.domain)
    scores['UA 指纹'] = step4_ua_fingerprint(users, sessions, args.domain)
    scores['激活时间'] = step5_activation(users, usage, args.domain)
    scores['积分消耗'] = step6_credits(users, usage, args.domain)

    # Domain clustering score
    suspect_count = len(users[users['email'].str.contains(f'@{args.domain}', case=False, na=False)])
    if suspect_count > 100:
        scores['域名聚类'] = 2
    elif suspect_count > 50:
        scores['域名聚类'] = 1
    else:
        scores['域名聚类'] = 0

    total = sum(scores.values())
    max_score = len(scores) * 2

    print("\n" + "="*60)
    print("综合评分")
    print("="*60)
    for dim, s in scores.items():
        emoji = ['✅', '⚠️', '🚨'][s]
        print(f"  {emoji} {dim}: {s}/2")

    level = '✅ 正常' if total <= 3 else ('⚠️ 需监控' if total <= 7 else '🚨 高风险')
    print(f"\n总分：{total}/{max_score} — {level}")


if __name__ == '__main__':
    main()
