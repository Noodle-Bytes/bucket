# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import logging
from pathlib import Path
from typing import Iterable, overload

from sqlalchemy import Integer, String, create_engine, insert, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.inspection import inspect
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import NullPool

from .common import (
    Accessor,
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    BucketWaiverTuple,
    GoalTuple,
    MergeReadout,
    PointHitTuple,
    PuppetReadout,
    Reader,
    Readout,
    Writer,
    point_tuple_from_row,
)

log = logging.getLogger(__name__)

###############################################################################
# Table definitions
###############################################################################


class BaseRow(DeclarativeBase): ...


def select_tup(table: type[BaseRow]):
    return select(*table.__table__.columns)


class DefinitionRow(BaseRow):
    __tablename__ = "definition"
    definition: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    sha: Mapped[str] = mapped_column(String(64))


class RunRow(BaseRow):
    __tablename__ = "run"
    run: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    definition: Mapped[int] = mapped_column(Integer)
    sha: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    source_key: Mapped[str] = mapped_column(String(100), nullable=False, default="")


class PointRow(BaseRow):
    __tablename__ = "point"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    depth: Mapped[int] = mapped_column(Integer, primary_key=True)
    end: Mapped[int] = mapped_column(Integer)
    axis_start: Mapped[int] = mapped_column(Integer)
    axis_end: Mapped[int] = mapped_column(Integer)
    axis_value_start: Mapped[int] = mapped_column(Integer)
    axis_value_end: Mapped[int] = mapped_column(Integer)
    goal_start: Mapped[int] = mapped_column(Integer)
    goal_end: Mapped[int] = mapped_column(Integer)
    bucket_start: Mapped[int] = mapped_column(Integer)
    bucket_end: Mapped[int] = mapped_column(Integer)
    target: Mapped[int] = mapped_column(Integer)
    target_buckets: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(30))


class PointMetaRow(BaseRow):
    __tablename__ = "point_meta"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    depth: Mapped[int] = mapped_column(Integer, primary_key=True)
    tier: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tags: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    motivation: Mapped[str] = mapped_column(String(300), nullable=False, default="")


class AxisRow(BaseRow):
    __tablename__ = "axis"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    value_start: Mapped[int] = mapped_column(Integer)
    value_end: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(30))


class GoalRow(BaseRow):
    __tablename__ = "goal"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    target: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(30))


class AxisValueRow(BaseRow):
    __tablename__ = "axis_value"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[str] = mapped_column(String(30))


class BucketGoalRow(BaseRow):
    __tablename__ = "bucket_goal"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal: Mapped[int] = mapped_column(Integer)


class PointHitRow(BaseRow):
    __tablename__ = "point_hit"
    run: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    depth: Mapped[int] = mapped_column(Integer, primary_key=True)
    hits: Mapped[int] = mapped_column(Integer)
    hit_buckets: Mapped[int] = mapped_column(Integer)
    full_buckets: Mapped[int] = mapped_column(Integer)
    # Added in storage format 3; databases written earlier lack these columns
    # and are migrated in place by SQLWriter (see _migrate_point_hit_columns).
    waived_buckets: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    waived_target: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )


# Columns of point_hit that databases written before format 3 do not have.
WAIVED_POINT_HIT_COLUMNS = ("waived_buckets", "waived_target")


class BucketHitRow(BaseRow):
    __tablename__ = "bucket_hit"
    run: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    hits: Mapped[int] = mapped_column(Integer)


class BucketWaiverRow(BaseRow):
    __tablename__ = "bucket_waiver"
    run: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    reason: Mapped[str] = mapped_column(String(300), nullable=False, default="")


def _point_hit_columns(bind) -> set[str]:
    """Names of the columns the point_hit table currently has ({} if absent)."""
    inspector = inspect(bind)
    if not inspector.has_table(PointHitRow.__tablename__):
        return set()
    return {
        column["name"] for column in inspector.get_columns(PointHitRow.__tablename__)
    }


def _migrate_point_hit_columns(engine) -> bool:
    """
    Add the format-3 waiver columns to a pre-existing point_hit table that
    lacks them (SQLite supports ADD COLUMN ... DEFAULT). Returns True when the
    table has every column of PointHitRow afterwards, False if the migration
    could not be applied (e.g. a read-only database).
    """
    existing = _point_hit_columns(engine)
    if not existing:
        # No table yet: metadata.create_all makes it with the full schema.
        return True
    missing = [
        column for column in PointHitRow.__table__.columns if column.key not in existing
    ]
    if not missing:
        return True
    try:
        with engine.begin() as connection:
            for column in missing:
                connection.execute(
                    text(
                        f"ALTER TABLE {PointHitRow.__tablename__} "
                        f"ADD COLUMN {column.key} INTEGER NOT NULL DEFAULT 0"
                    )
                )
    except OperationalError as exc:
        log.warning(
            "Could not add columns %s to %s (%s); waiver counts will not be stored",
            [column.key for column in missing],
            PointHitRow.__tablename__,
            exc,
        )
        return False
    return True


###############################################################################
# Accessors
###############################################################################


class SQLWriter(Writer):
    """
    Write to an SQL database
    """

    def __init__(self, engine):
        self.engine = engine
        # SQLAccessor creates any missing tables (point_meta, bucket_waiver)
        # up front; these flags only stay False when that migration failed.
        self._has_point_meta = inspect(engine).has_table(PointMetaRow.__tablename__)
        self._has_bucket_waiver = inspect(engine).has_table(
            BucketWaiverRow.__tablename__
        )
        # Columns cannot be added by create_all, so pre-format-3 point_hit
        # tables are altered in place here.
        self._has_waived_columns = _migrate_point_hit_columns(engine)

    def write(self, readout: Readout):
        # Rows are inserted with bulk executemany statements rather than
        # per-row session.add(), which is an order of magnitude slower for
        # the large bucket tables. Each table's columns are populated from the
        # tuple fields of the same name, so the table definitions above are the
        # single owner of the tuple-to-column mapping (including the core/meta
        # split of PointTuple and the schema-stable subset of AxisValueTuple).
        with Session(self.engine) as session:

            def bulk(table: type[BaseRow], ref_column: str, ref: int, tuples, skip=()):
                fields = [
                    column.key
                    for column in table.__table__.columns
                    if column.key != ref_column and column.key not in skip
                ]
                rows = []
                for tup in tuples:
                    row = {field: getattr(tup, field) for field in fields}
                    row[ref_column] = ref
                    rows.append(row)
                if rows:
                    session.execute(insert(table), rows)

            # Write the definition out
            def_row = DefinitionRow(sha=readout.get_def_sha())
            session.add(def_row)
            session.flush()
            def_ref = def_row.definition

            points = list(readout.iter_points())
            bulk(PointRow, "definition", def_ref, points)
            if self._has_point_meta:
                bulk(PointMetaRow, "definition", def_ref, points)
            bulk(AxisRow, "definition", def_ref, readout.iter_axes())
            bulk(AxisValueRow, "definition", def_ref, readout.iter_axis_values())
            bulk(GoalRow, "definition", def_ref, readout.iter_goals())
            bulk(BucketGoalRow, "definition", def_ref, readout.iter_bucket_goals())

            rec_row = RunRow(
                definition=def_ref,
                sha=readout.get_rec_sha(),
                source=readout.get_source(),
                source_key=readout.get_source_key(),
            )
            session.add(rec_row)
            session.flush()
            rec_ref = rec_row.run

            bulk(
                PointHitRow,
                "run",
                rec_ref,
                readout.iter_point_hits(),
                skip=() if self._has_waived_columns else WAIVED_POINT_HIT_COLUMNS,
            )
            bulk(BucketHitRow, "run", rec_ref, readout.iter_bucket_hits())
            if self._has_bucket_waiver:
                bulk(BucketWaiverRow, "run", rec_ref, readout.iter_bucket_waivers())

            session.commit()

        return rec_ref


class SQLReader(Reader):
    """
    Read from an SQL database
    """

    def __init__(self, engine):
        self.engine = engine

    def read(self, rec_ref: int):
        readout = PuppetReadout()

        with Session(self.engine) as session:
            rec_st = select(RunRow).where(RunRow.run == rec_ref)
            rec_row = session.scalars(rec_st).one()
            readout.rec_sha = rec_row.sha
            readout.source = rec_row.source or ""
            readout.source_key = rec_row.source_key or ""
            def_ref = rec_row.definition

            def_st = select(DefinitionRow).where(DefinitionRow.definition == def_ref)
            def_row = session.scalars(def_st).one()
            readout.def_sha = def_row.sha

            point_st = (
                select_tup(PointRow)
                .where(PointRow.definition == def_ref)
                .order_by(PointRow.start, PointRow.depth)
            )
            axis_st = (
                select_tup(AxisRow)
                .where(AxisRow.definition == def_ref)
                .order_by(AxisRow.start)
            )
            axis_value_st = (
                select_tup(AxisValueRow)
                .where(AxisValueRow.definition == def_ref)
                .order_by(AxisValueRow.start)
            )
            goal_st = (
                select_tup(GoalRow)
                .where(GoalRow.definition == def_ref)
                .order_by(GoalRow.start)
            )
            bucket_goal_st = (
                select_tup(BucketGoalRow)
                .where(BucketGoalRow.definition == def_ref)
                .order_by(BucketGoalRow.start)
            )

            point_metadata = {}
            if inspect(session.bind).has_table(PointMetaRow.__tablename__):
                point_meta_st = select(PointMetaRow).where(
                    PointMetaRow.definition == def_ref
                )
                for point_meta in session.scalars(point_meta_st):
                    point_metadata[(point_meta.start, point_meta.depth)] = (
                        point_meta.tier,
                        point_meta.tags,
                        point_meta.motivation,
                    )

            for point_row in session.execute(point_st).all():
                core_row = list(point_row[1:])
                start = core_row[0]
                depth = core_row[1]
                if metadata := point_metadata.get((start, depth)):
                    core_row.extend(metadata)
                readout.points.append(point_tuple_from_row(core_row))

            for axis_row in session.execute(axis_st).all():
                readout.axes.append(AxisTuple(*axis_row[1:]))

            for axis_value_row in session.execute(axis_value_st).all():
                readout.axis_values.append(AxisValueTuple(*axis_value_row[1:]))

            for goal_row in session.execute(goal_st).all():
                readout.goals.append(GoalTuple(*goal_row[1:]))

            for bucket_goal_row in session.execute(bucket_goal_st).all():
                readout.bucket_goals.append(BucketGoalTuple(*bucket_goal_row[1:]))

            # A read-only pre-format-3 database still lacks the waived
            # columns; select only what is there and let the tuple default
            # them to 0.
            point_hit_columns = _point_hit_columns(session.bind)
            point_hit_st = (
                select(
                    *(
                        column
                        for column in PointHitRow.__table__.columns
                        if column.key in point_hit_columns
                    )
                )
                .where(PointHitRow.run == rec_ref)
                .order_by(PointHitRow.start, PointHitRow.depth)
            )
            bucket_hit_st = (
                select_tup(BucketHitRow)
                .where(BucketHitRow.run == rec_ref)
                .order_by(BucketHitRow.start)
            )

            for point_hit_row in session.execute(point_hit_st).all():
                readout.point_hits.append(PointHitTuple(*point_hit_row[1:]))

            for bucket_hit_row in session.execute(bucket_hit_st).all():
                readout.bucket_hits.append(BucketHitTuple(*bucket_hit_row[1:]))

            if inspect(session.bind).has_table(BucketWaiverRow.__tablename__):
                bucket_waiver_st = (
                    select_tup(BucketWaiverRow)
                    .where(BucketWaiverRow.run == rec_ref)
                    .order_by(BucketWaiverRow.start)
                )
                for bucket_waiver_row in session.execute(bucket_waiver_st).all():
                    readout.bucket_waivers.append(
                        BucketWaiverTuple(*bucket_waiver_row[1:])
                    )

        return readout

    def read_all(self) -> Iterable[Readout]:
        with Session(self.engine) as session:
            for rec_row in session.scalars(select(RunRow)).all():
                yield self.read(rec_row.run)


class SQLAccessor(Accessor):
    """
    Read/Write from/to an SQL database
    """

    def __init__(self, url: str):
        # SQLite file connections are not pooled: a pooled connection keeps
        # the .db file open after the session closes, which on Windows blocks
        # deleting or moving the file (e.g. temporary directory cleanup).
        engine_kwargs = {"poolclass": NullPool} if url.startswith("sqlite") else {}
        self.engine = create_engine(url, **engine_kwargs)
        try:
            BaseRow.metadata.create_all(self.engine)
        except OperationalError as exc:
            # Allow read-only access to legacy DBs where schema migration
            # cannot be applied (e.g. file permissions).  Log so that
            # unexpected errors (corrupt DB, wrong SQLite version, etc.) are
            # not silently ignored.
            log.warning(
                "Could not apply schema migrations to %s (read-only access): %s",
                self.engine.url,
                exc,
            )

    @classmethod
    def File(cls, path: str | Path) -> "SQLAccessor":
        # Forward slashes keep the URL valid for Windows paths too.
        return cls(f"sqlite:///{Path(path).as_posix()}")

    def reader(self):
        return SQLReader(self.engine)

    def writer(self):
        return SQLWriter(self.engine)

    @overload
    @classmethod
    def merge_files(cls, db_paths: list[str | Path], /): ...
    @overload
    @classmethod
    def merge_files(cls, *db_paths: str | Path): ...
    @classmethod
    def merge_files(cls, *db_paths):
        if len(db_paths) == 1 and not isinstance(db_paths[0], (str, Path)):
            db_paths = db_paths[0]
        merged_readout = None
        for db_path in db_paths:
            sql_accessor = cls.File(db_path)
            readout_iter = iter(sql_accessor.read_all())
            if merged_readout is None:
                if (first_readout := next(readout_iter, None)) is None:
                    continue
                merged_readout = MergeReadout(first_readout)
            merged_readout.merge(*readout_iter)
        return merged_readout
