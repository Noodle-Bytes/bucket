# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import logging
from datetime import datetime
from pathlib import Path
from typing import Iterable, overload

from sqlalchemy import Integer, String, create_engine, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from .common import (
    Accessor,
    AxisTuple,
    AxisValueTuple,
    BucketGoalTuple,
    BucketHitTuple,
    GoalTuple,
    MergeReadout,
    PointHitTuple,
    PointTuple,
    PuppetReadout,
    Reader,
    Readout,
    Writer,
)

logger = logging.getLogger(__name__)


###############################################################################
# Helper function for parallel batch merging
###############################################################################


def _merge_sql_batch(args):
    """
    Merge a single batch of databases - used by merge_sql_direct for parallel processing.
    This must be a module-level function to be picklable for multiprocessing.

    Args:
        args: Tuple of (batch_idx, batch_paths, MAX_ATTACH, total_inputs)

    Returns:
        Path to the merged temporary database
    """
    import tempfile
    from pathlib import Path

    from sqlalchemy import create_engine, text

    batch_idx, batch_paths, MAX_ATTACH, total_inputs = args
    batch_num = batch_idx // MAX_ATTACH + 1
    total_batches = (total_inputs + MAX_ATTACH - 1) // MAX_ATTACH

    logger.info(
        f"Merging batch {batch_num}/{total_batches} ({len(batch_paths)} databases)"
    )

    # Create temporary database for this batch
    temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    temp_db_path = Path(temp_db.name)
    temp_db.close()

    # Apply aggressive performance settings for temporary database
    temp_engine = create_engine(f"sqlite:///{temp_db_path}")
    with temp_engine.connect() as temp_conn:
        temp_conn.execute(text("PRAGMA journal_mode=WAL"))
        temp_conn.execute(text("PRAGMA synchronous=OFF"))  # Faster for temp files
        temp_conn.execute(text("PRAGMA cache_size=-128000"))  # 128MB cache
        temp_conn.execute(text("PRAGMA temp_store=MEMORY"))
        temp_conn.commit()
    temp_engine.dispose()

    # Recursively merge this batch (without parallel for nested calls)
    merge_sql_direct(
        temp_db_path,
        *batch_paths,
        source=f"batch_{batch_idx // MAX_ATTACH}",
        source_key="intermediate_merge",
        parallel=False,  # Don't use parallel for nested merges
    )
    return temp_db_path


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

    @classmethod
    def from_tuple(cls, definition: int, tup: PointTuple):
        return cls(definition=definition, **tup._asdict())


class AxisRow(BaseRow):
    __tablename__ = "axis"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    value_start: Mapped[int] = mapped_column(Integer)
    value_end: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(30))

    @classmethod
    def from_tuple(cls, definition: int, tup: AxisTuple):
        return cls(definition=definition, **tup._asdict())


class GoalRow(BaseRow):
    __tablename__ = "goal"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    target: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(String(30))

    @classmethod
    def from_tuple(cls, definition: int, tup: GoalTuple):
        return cls(definition=definition, **tup._asdict())


class AxisValueRow(BaseRow):
    __tablename__ = "axis_value"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    value: Mapped[str] = mapped_column(String(30))

    @classmethod
    def from_tuple(cls, definition: int, tup: AxisValueTuple):
        return cls(definition=definition, **tup._asdict())


class BucketGoalRow(BaseRow):
    __tablename__ = "bucket_goal"
    definition: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal: Mapped[int] = mapped_column(Integer)

    @classmethod
    def from_tuple(cls, definition: int, tup: BucketGoalTuple):
        return cls(definition=definition, **tup._asdict())


class PointHitRow(BaseRow):
    __tablename__ = "point_hit"
    run: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    depth: Mapped[int] = mapped_column(Integer, primary_key=True)
    hits: Mapped[int] = mapped_column(Integer)
    hit_buckets: Mapped[int] = mapped_column(Integer)
    full_buckets: Mapped[int] = mapped_column(Integer)

    @classmethod
    def from_tuple(cls, run: int, tup: PointHitTuple):
        return cls(run=run, **tup._asdict())


class BucketHitRow(BaseRow):
    __tablename__ = "bucket_hit"
    run: Mapped[int] = mapped_column(Integer, primary_key=True)
    start: Mapped[int] = mapped_column(Integer, primary_key=True)
    hits: Mapped[int] = mapped_column(Integer)

    @classmethod
    def from_tuple(cls, run: int, tup: BucketHitTuple):
        return cls(run=run, **tup._asdict())


###############################################################################
# Accessors
###############################################################################


class SQLWriter(Writer):
    """
    Write to an SQL database
    """

    def __init__(self, engine):
        self.engine = engine

    def write(self, readout: Readout):
        with Session(self.engine) as self.session:
            # Write the definition out
            def_row = DefinitionRow(sha=readout.get_def_sha())
            self.session.add(def_row)
            self.session.commit()
            def_ref = def_row.definition

            for point in readout.iter_points():
                self.session.add(PointRow.from_tuple(def_ref, point))

            for axis in readout.iter_axes():
                self.session.add(AxisRow.from_tuple(def_ref, axis))

            for axis_value in readout.iter_axis_values():
                self.session.add(AxisValueRow.from_tuple(def_ref, axis_value))

            for goal in readout.iter_goals():
                self.session.add(GoalRow.from_tuple(def_ref, goal))

            for bucket_goal in readout.iter_bucket_goals():
                self.session.add(BucketGoalRow.from_tuple(def_ref, bucket_goal))

            rec_row = RunRow(
                definition=def_ref,
                sha=readout.get_rec_sha(),
                source=readout.get_source(),
                source_key=readout.get_source_key(),
            )
            self.session.add(rec_row)
            self.session.commit()
            rec_ref = rec_row.run

            for point_hit in readout.iter_point_hits():
                self.session.add(PointHitRow.from_tuple(rec_ref, point_hit))

            for bucket_hit in readout.iter_bucket_hits():
                self.session.add(BucketHitRow.from_tuple(rec_ref, bucket_hit))

            self.session.commit()

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

            for point_row in session.execute(point_st).all():
                readout.points.append(PointTuple(*point_row[1:]))

            for axis_row in session.execute(axis_st).all():
                readout.axes.append(AxisTuple(*axis_row[1:]))

            for axis_value_row in session.execute(axis_value_st).all():
                readout.axis_values.append(AxisValueTuple(*axis_value_row[1:]))

            for goal_row in session.execute(goal_st).all():
                readout.goals.append(GoalTuple(*goal_row[1:]))

            for bucket_goal_row in session.execute(bucket_goal_st).all():
                readout.bucket_goals.append(BucketGoalTuple(*bucket_goal_row[1:]))

            point_hit_st = (
                select_tup(PointHitRow)
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
        self.engine = create_engine(url)
        BaseRow.metadata.create_all(self.engine)

    @classmethod
    def File(cls, path: str | Path) -> "SQLAccessor":
        return cls(f"sqlite:///{path}")

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


def merge_sql_direct(
    output_path: Path,
    *input_paths: Path,
    source: str | None = None,
    source_key: str | None = None,
    parallel: bool = True,
    max_workers: int | None = None,
) -> int:
    """
    Directly merge multiple SQLite coverage databases into a single database
    without loading data through Python Readout objects. This is more efficient
    for large-scale merges.

    This function uses SQLite's ATTACH DATABASE feature to efficiently combine
    multiple coverage databases. It validates SHA compatibility, deduplicates
    definition data, and sums bucket hit counts across all input databases.

    Parameters:
        output_path: Path where the merged database will be created
        input_paths: One or more paths to SQLite databases to merge
        source: Optional source identifier for the merged run (defaults to "Merged_TIMESTAMP")
        source_key: Optional source key for the merged run (defaults to "")
        parallel: If True, process batches in parallel (default: True)
        max_workers: Maximum number of parallel workers (default: CPU count)

    Returns:
        The run ID of the merged record in the output database

    Raises:
        ValueError: If input_paths is empty or contains non-existent files
        RuntimeError: If databases have incompatible definition SHAs
        RuntimeError: If any database is not a valid SQLite file

    Note:
        - All input databases must have the same coverage definition (same SHA)
        - Only works with SQLite databases (not PostgreSQL or other backends)
        - The output database will contain a single merged run record
        - Bucket hits are summed across all input databases
        - Point hits are recomputed from the merged bucket hits
    """
    if not input_paths:
        raise ValueError("At least one input database path must be provided")

    # Validate all input paths exist and are files
    for path in input_paths:
        if not path.exists():
            raise ValueError(f"Input database does not exist: {path}")
        if not path.is_file():
            raise ValueError(f"Input path is not a file: {path}")

    # Create output database
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        logger.warning(
            f"Output database already exists, will be overwritten: {output_path}"
        )
        output_path.unlink()

    engine = create_engine(f"sqlite:///{output_path}")
    BaseRow.metadata.create_all(engine)

    # Apply performance optimizations
    with engine.connect() as conn:
        conn.execute(text("PRAGMA journal_mode=WAL"))
        conn.execute(
            text("PRAGMA synchronous=NORMAL")
        )  # NORMAL for main DB, OFF for temp
        conn.execute(text("PRAGMA cache_size=-64000"))  # 64MB cache
        conn.execute(text("PRAGMA temp_store=MEMORY"))
        conn.execute(text("PRAGMA mmap_size=268435456"))  # 256MB memory-mapped I/O
        conn.commit()

    logger.info(f"Merging {len(input_paths)} databases into {output_path}")

    # SQLite's max attached databases is a compile-time limit (SQLITE_MAX_ATTACHED)
    # Most systems default to 10, some allow up to 125
    # Query the actual limit and use most of it (leave 1 for main DB)
    with engine.connect() as conn:
        try:
            max_attached = conn.execute(text("PRAGMA max_attached")).scalar() or 10
            MAX_ATTACH = max(1, max_attached - 1)  # Leave 1 for main database
            logger.debug(
                f"SQLite max_attached={max_attached}, using MAX_ATTACH={MAX_ATTACH}"
            )
        except Exception:
            MAX_ATTACH = 9  # Conservative fallback
            logger.debug(
                f"Could not detect max_attached, using conservative MAX_ATTACH={MAX_ATTACH}"
            )

    # If we have more databases than the limit, merge in batches
    if len(input_paths) > MAX_ATTACH:
        logger.info(
            f"Large merge detected ({len(input_paths)} databases). Merging in batches of {MAX_ATTACH}..."
        )

        temp_merged_dbs = []

        # Create batch tasks
        batches = []
        for batch_idx in range(0, len(input_paths), MAX_ATTACH):
            batch_paths = input_paths[batch_idx : batch_idx + MAX_ATTACH]
            batches.append((batch_idx, batch_paths, MAX_ATTACH, len(input_paths)))

        # Process batches in parallel or serially
        if parallel and len(batches) > 1:
            import concurrent.futures
            import os

            workers = max_workers or min(
                os.cpu_count() or 1, 8
            )  # Cap at 8 for consistency
            logger.info(
                f"Processing {len(batches)} batches in parallel with {workers} workers..."
            )

            with concurrent.futures.ProcessPoolExecutor(
                max_workers=workers
            ) as executor:
                temp_merged_dbs = list(executor.map(_merge_sql_batch, batches))
        else:
            # Serial processing
            for batch in batches:
                temp_merged_dbs.append(_merge_sql_batch(batch))

        # Now merge all the batch results
        logger.info(f"Merging {len(temp_merged_dbs)} batch results into final database")
        merge_sql_direct(
            output_path,
            *temp_merged_dbs,
            source=source,
            source_key=source_key,
            parallel=parallel,
            max_workers=max_workers,
        )

        # Clean up temporary databases
        for temp_db in temp_merged_dbs:
            temp_db.unlink()

        logger.info("Batch merge complete")

        # Read the merged run_id from the final database
        final_engine = create_engine(f"sqlite:///{output_path}")
        with Session(final_engine) as final_session:
            merged_run_id = final_session.execute(
                text("SELECT run FROM run ORDER BY run DESC LIMIT 1")
            ).scalar()
        return merged_run_id

    # Standard merge path for <= MAX_ATTACH databases
    with Session(engine) as session:
        try:
            # Step 1: Attach all input databases and validate SHA compatibility
            logger.debug("Attaching input databases and validating SHA compatibility")
            definition_shas = []
            record_shas = []

            for idx, db_path in enumerate(input_paths):
                alias = f"src{idx}"
                session.execute(
                    text(f"ATTACH DATABASE :path AS {alias}"), {"path": str(db_path)}
                )

                # Verify this is a valid bucket database
                try:
                    def_sha = session.execute(
                        text(f"SELECT sha FROM {alias}.definition LIMIT 1")
                    ).scalar()
                    if def_sha is None:
                        raise RuntimeError(f"Database has no definition: {db_path}")
                    definition_shas.append(def_sha)

                    rec_sha = session.execute(
                        text(f"SELECT sha FROM {alias}.run LIMIT 1")
                    ).scalar()
                    if rec_sha is None:
                        raise RuntimeError(f"Database has no runs: {db_path}")
                    record_shas.append(rec_sha)

                except Exception as e:
                    raise RuntimeError(f"Invalid bucket database: {db_path}") from e

            # Verify all databases have the same definition SHA
            if len(set(definition_shas)) > 1:
                raise RuntimeError(
                    f"Cannot merge databases with different definition SHAs: {set(definition_shas)}"
                )

            # Verify all databases have the same record SHA
            if len(set(record_shas)) > 1:
                raise RuntimeError(
                    f"Cannot merge databases with different record SHAs: {set(record_shas)}"
                )

            master_def_sha = definition_shas[0]
            master_rec_sha = record_shas[0]
            logger.info(f"All databases share definition SHA: {master_def_sha[:16]}...")
            logger.info(f"All databases share record SHA: {master_rec_sha[:16]}...")

            # Step 2: Copy definition data from first database (they're all identical)
            logger.debug("Copying definition data from first database")
            session.execute(
                text("INSERT INTO definition SELECT * FROM src0.definition")
            )
            session.flush()

            # Get the definition ID we just created
            def_id = session.execute(
                text("SELECT definition FROM definition WHERE sha = :sha"),
                {"sha": master_def_sha},
            ).scalar()

            # Copy all definition tables (excluding the definition column which we provide)
            logger.debug("Copying point data")
            session.execute(
                text("""
                    INSERT INTO point (definition, start, depth, end, axis_start, axis_end,
                                      axis_value_start, axis_value_end, goal_start, goal_end,
                                      bucket_start, bucket_end, target, target_buckets, name, description)
                    SELECT :def_id, start, depth, end, axis_start, axis_end,
                           axis_value_start, axis_value_end, goal_start, goal_end,
                           bucket_start, bucket_end, target, target_buckets, name, description
                    FROM src0.point
                    WHERE definition = (SELECT definition FROM src0.definition LIMIT 1)
                """),
                {"def_id": def_id},
            )

            logger.debug("Copying axis data")
            session.execute(
                text("""
                    INSERT INTO axis (definition, start, value_start, value_end, name, description)
                    SELECT :def_id, start, value_start, value_end, name, description
                    FROM src0.axis
                    WHERE definition = (SELECT definition FROM src0.definition LIMIT 1)
                """),
                {"def_id": def_id},
            )

            logger.debug("Copying axis_value data")
            session.execute(
                text("""
                    INSERT INTO axis_value (definition, start, value)
                    SELECT :def_id, start, value
                    FROM src0.axis_value
                    WHERE definition = (SELECT definition FROM src0.definition LIMIT 1)
                """),
                {"def_id": def_id},
            )

            logger.debug("Copying goal data")
            session.execute(
                text("""
                    INSERT INTO goal (definition, start, target, name, description)
                    SELECT :def_id, start, target, name, description
                    FROM src0.goal
                    WHERE definition = (SELECT definition FROM src0.definition LIMIT 1)
                """),
                {"def_id": def_id},
            )

            logger.debug("Copying bucket_goal data")
            session.execute(
                text("""
                    INSERT INTO bucket_goal (definition, start, goal)
                    SELECT :def_id, start, goal
                    FROM src0.bucket_goal
                    WHERE definition = (SELECT definition FROM src0.definition LIMIT 1)
                """),
                {"def_id": def_id},
            )

            # Step 3: Prepare merged source metadata
            if source is None:
                source = f"Merged_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            if source_key is None:
                source_key = ""

            logger.info(
                f"Creating merged run with source='{source}', source_key='{source_key}'"
            )

            # Step 4: Create the merged run record
            rec_row = RunRow(
                definition=def_id,
                sha=master_rec_sha,
                source=source,
                source_key=source_key,
            )
            session.add(rec_row)
            session.flush()
            merged_run_id = rec_row.run

            # Step 5: Merge bucket_hit data by summing across all databases
            logger.debug("Merging bucket_hit data (summing across all databases)")

            # Build a UNION ALL query to combine all bucket_hit tables
            union_parts = []
            for idx in range(len(input_paths)):
                union_parts.append(f"""
                    SELECT start, hits
                    FROM src{idx}.bucket_hit
                """)

            union_query = " UNION ALL ".join(union_parts)

            # Insert the summed bucket hits
            session.execute(
                text(f"""
                INSERT INTO bucket_hit (run, start, hits)
                SELECT :run_id, start, SUM(hits) as total_hits
                FROM ({union_query})
                GROUP BY start
                ORDER BY start
            """),
                {"run_id": merged_run_id},
            )

            # Step 6: Recompute point_hit data from merged bucket_hit
            logger.debug("Recomputing point_hit data from merged bucket hits")

            # Get all points from the definition
            points = session.execute(
                text("""
                    SELECT start, depth, end, bucket_start, bucket_end, target, target_buckets
                    FROM point
                    WHERE definition = :def_id
                    ORDER BY start, depth
                """),
                {"def_id": def_id},
            ).all()

            # Get bucket goals and goal targets for validation
            bucket_goals = {}
            goal_targets = {}

            # First get all goals
            goals = session.execute(
                text("SELECT start, target FROM goal WHERE definition = :def_id"),
                {"def_id": def_id},
            ).all()
            for goal_start, goal_target in goals:
                goal_targets[goal_start] = goal_target

            # Then get bucket goal mappings
            bg_rows = session.execute(
                text("SELECT start, goal FROM bucket_goal WHERE definition = :def_id"),
                {"def_id": def_id},
            ).all()
            for bg_start, bg_goal in bg_rows:
                bucket_goals[bg_start] = goal_targets.get(
                    bg_goal, 10
                )  # Default to 10 if not found

            # Get all merged bucket hits
            all_bucket_hits = {}
            bucket_hit_rows = session.execute(
                text("SELECT start, hits FROM bucket_hit WHERE run = :run_id"),
                {"run_id": merged_run_id},
            ).all()
            for bh_start, bh_hits in bucket_hit_rows:
                all_bucket_hits[bh_start] = bh_hits

            # Compute point hits for each point
            point_hit_rows = []
            for (
                point_start,
                point_depth,
                point_end,
                bucket_start,
                bucket_end,
                target,
                target_buckets,
            ) in points:
                hits = 0
                hit_buckets = 0
                full_buckets = 0

                for bucket_idx in range(bucket_start, bucket_end):
                    bucket_target = bucket_goals.get(bucket_idx, 10)
                    bucket_hits = all_bucket_hits.get(bucket_idx, 0)

                    if bucket_target > 0:
                        capped_hits = min(bucket_hits, bucket_target)
                        if bucket_hits > 0:
                            hit_buckets += 1
                            if capped_hits == bucket_target:
                                full_buckets += 1
                        hits += capped_hits

                point_hit_rows.append(
                    {
                        "run_id": merged_run_id,
                        "start": point_start,
                        "depth": point_depth,
                        "hits": hits,
                        "hit_buckets": hit_buckets,
                        "full_buckets": full_buckets,
                    }
                )

            # Insert all point hits
            for row in point_hit_rows:
                session.execute(
                    text("""
                        INSERT INTO point_hit (run, start, depth, hits, hit_buckets, full_buckets)
                        VALUES (:run_id, :start, :depth, :hits, :hit_buckets, :full_buckets)
                    """),
                    row,
                )

            # Commit the transaction
            session.commit()
            logger.info(f"Successfully merged databases into run ID {merged_run_id}")

            return merged_run_id

        except Exception as e:
            session.rollback()
            logger.error(f"Merge failed: {e}")
            if output_path.exists():
                output_path.unlink()
            raise

        finally:
            # Detach all databases
            for idx in range(len(input_paths)):
                try:
                    session.execute(text(f"DETACH DATABASE src{idx}"))
                except Exception:
                    pass  # Ignore detach errors
