from contextlib import contextmanager

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row

import config


@contextmanager
def transaction(repeatable_read=False):
    if not config.DATABASE_URL:
        raise HTTPException(503, "База данных не настроена")
    with psycopg.connect(config.DATABASE_URL, row_factory=dict_row, connect_timeout=5) as conn:
        if repeatable_read:
            conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        conn.execute("SET LOCAL search_path TO crm, public, extensions")
        conn.execute("SET LOCAL statement_timeout = '15s'")
        yield conn


def one(conn, sql, params=()):
    return conn.execute(sql, params).fetchone()


def all_rows(conn, sql, params=()):
    return conn.execute(sql, params).fetchall()


def required(conn, sql, params=()):
    result = one(conn, sql, params)
    if result is None:
        raise HTTPException(404, "Объект не найден")
    return result
