"""Analyst: pulls yesterday's acquisition numbers (read-only) into growth.daily_stats."""
import datetime as dt
import traceback

from common import db, event, fetch, finish_run, start_run


def upsert(conn, day, metric, value, source=""):
    with conn.cursor() as cur:
        cur.execute(
            """insert into growth.daily_stats (day, metric, source, value) values (%s,%s,%s,%s)
               on conflict (day, metric, source) do update set value = excluded.value""",
            (day, metric, source or "", value),
        )


def domain(ref):
    if not ref:
        return "direct"
    r = ref.lower().split("//")[-1].split("/")[0]
    return r[4:] if r.startswith("www.") else r


def main():
    with db() as conn:
        run = start_run(conn, "daily_stats")
        try:
            y = dt.date.today() - dt.timedelta(days=1)
            core = fetch(conn, "select * from growth.v_daily_core where day >= %s order by day", (y - dt.timedelta(days=13),))
            for r in core:
                for m in ("signups", "orders", "gmv", "new_listings"):
                    upsert(conn, r["day"], m, r[m] or 0)
            live = core[-1]["live_listings_now"] if core else 0
            upsert(conn, dt.date.today(), "live_listings", live)

            sig = fetch(conn, """select case when creator_code is not null then 'creator'
                                             when was_referred then 'referral' else 'organic' end as src, count(*) n
                                 from growth.v_signups where created_at::date = %s group by 1""", (y,))
            for r in sig:
                upsert(conn, y, "signups_by_source", r["n"], r["src"])

            clicks = fetch(conn, """select coalesce(nullif(utm_source,''), 'untagged') src, count(*) n
                                    from growth.v_link_clicks where created_at::date = %s group by 1""", (y,))
            for r in clicks:
                upsert(conn, y, "clicks_by_source", r["n"], r["src"])

            visits = fetch(conn, "select referrer from growth.v_site_visits where created_at::date = %s", (y,))
            counts = {}
            for v in visits:
                d = domain(v["referrer"])
                counts[d] = counts.get(d, 0) + 1
            for d, n in sorted(counts.items(), key=lambda x: -x[1])[:12]:
                upsert(conn, y, "visits_by_referrer", n, d)
            upsert(conn, y, "visits", len(visits))

            yday = next((r for r in core if r["day"] == y), None)
            summary = {"day": str(y), "signups": yday and yday["signups"], "orders": yday and yday["orders"],
                       "visits": len(visits), "live_listings": live}
            event(conn, "ANALYST", "stats", f"Pulled yesterday's numbers: {summary['signups']} sign-ups, {len(visits)} visits", summary)
            finish_run(conn, run, "done", summary)
            print(summary)
        except Exception as e:
            finish_run(conn, run, "failed", error=traceback.format_exc()[-2000:])
            raise


if __name__ == "__main__":
    main()
