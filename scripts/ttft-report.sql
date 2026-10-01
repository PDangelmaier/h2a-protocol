-- TTFT P50/P95 Report — per day
-- Usage: psql $DATABASE_URL -f scripts/ttft-report.sql
-- Or:   supabase db execute -f scripts/ttft-report.sql

SELECT
  date_trunc('day', created_at)::date AS day,
  count(*)                            AS measurements,
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY (metadata->>'ttft_ms')::numeric))  AS p50_ms,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY (metadata->>'ttft_ms')::numeric))  AS p95_ms,
  round(avg((metadata->>'ttft_ms')::numeric))  AS avg_ms,
  round(max((metadata->>'ttft_ms')::numeric))  AS max_ms,
  count(*) FILTER (WHERE (metadata->>'ttft_ms')::numeric > 1500) AS sla_breaches
FROM analytics_events
WHERE event_type = 'ttft_measurement'
  AND created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;
