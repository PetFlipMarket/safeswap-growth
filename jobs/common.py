"""Shared helpers: database connection and run/event logging."""
import json
import os
from contextlib import contextmanager

import psycopg


@contextmanager
def db():
    conn = psycopg.connect(os.environ["SAFESWAP_READONLY_DB_URL"], autocommit=True, prepare_threshold=None)
    try:
        yield conn
    finally:
        conn.close()


def start_run(conn, job):
    with conn.cursor() as cur:
        cur.execute("insert into growth.runs (job) values (%s) returning id", (job,))
        return cur.fetchone()[0]


def finish_run(conn, run_id, status="done", summary=None, error=None):
    with conn.cursor() as cur:
        cur.execute(
            "update growth.runs set status=%s, finished_at=now(), summary=%s, error=%s where id=%s",
            (status, json.dumps(summary) if summary is not None else None, error, run_id),
        )


def event(conn, agent, kind, message, data=None):
    with conn.cursor() as cur:
        cur.execute(
            "insert into growth.events (agent, kind, message, data) values (%s,%s,%s,%s)",
            (agent, kind, message, json.dumps(data) if data is not None else None),
        )


def fetch(conn, sql, params=None):
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]
