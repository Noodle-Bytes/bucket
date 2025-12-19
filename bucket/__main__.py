# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

from pathlib import Path
from typing import Iterable

import click

from .rw import ArchiveAccessor, ConsoleWriter, HTMLWriter, JSONAccessor, SQLAccessor
from .rw.common import MergeReadout, Readout
from .rw.sql import merge_sql_direct


@click.group()
@click.pass_context
@click.option(
    "--web-path",
    help="Path to the web viewer",
    default=Path(__file__).parent.parent / "viewer",
    type=click.Path(exists=True, readable=True, path_type=Path),
)
def cli(ctx, web_path):
    ctx.obj = {"web_path": web_path}


_VALID_READERS = ["sql", "json", "archive"]


def _split_spec(spec: str) -> tuple[str | None, str, str]:
    """
    Split a readout spec into its components.

    Valid Formats:
        - `<record>@<type>:<URI>`
        - `<record>@:<URI>`
        - `<type>:<URI>`
        - `<URI>`

    Returns: (record: str | None, type: str, uri: str)
    """
    record = None

    # Get record if present
    if "@" in spec:
        record, spec = spec.split("@", 1)
        record = int(record)

    # Get type if present
    if ":" in spec:
        head, tail = spec.split(":", 1)
        if head in _VALID_READERS:
            typ, uri = head, tail
        else:
            typ, uri = None, spec
    else:
        typ, uri = None, spec

    # Infer type if missing
    if typ is None:
        if uri.endswith(".db"):
            typ = "sql"
        elif uri.endswith(".json"):
            typ = "json"
        elif uri.endswith(".bktgz"):
            typ = "archive"
        else:
            raise ValueError(
                f"Could not infer reader type from '{uri}'; please specify explicitly."
            )

    return record, typ, uri


def get_readouts_from_spec(*specs: str) -> Iterable[Readout]:
    "Parse readout specs into Readout objects."
    for spec in specs:
        record, typ, uri = _split_spec(spec)

        if typ == "sql":
            sql_path = Path(uri)
            assert sql_path.exists(), f"SQL path does not exist: {sql_path}"
            assert sql_path.is_file(), f"SQL path is not a file: {sql_path}"

            reader = SQLAccessor.File(sql_path).reader()

        elif typ == "json":
            json_path = Path(uri)
            assert json_path.exists(), f"JSON path does not exist: {uri}"
            assert json_path.is_file(), f"JSON path is not a file: {uri}"

            reader = JSONAccessor(json_path).reader()

        elif typ == "archive":
            archive_path = Path(uri)
            assert archive_path.exists(), f"Archive path does not exist: {uri}"
            assert archive_path.is_file(), f"Archive path is not a file: {uri}"

            reader = ArchiveAccessor(archive_path).reader()
        else:
            raise ValueError(f"Unknown reader type: {typ}")

        if record is None:
            yield from reader.read_all()
        else:
            yield reader.read(record)


@cli.group()
@click.pass_context
@click.option(
    "--read",
    "-r",
    "readout_specs",
    multiple=True,
    type=str,
    help=f"""Can be specified multiple times.
    Valid Formats:
        - `<record>@<type>:<URI>`
        - `<record>@:<URI>`
        - `<type>:<URI>`
        - `<URI>`

    If the <record> is omitted, all records from the source are read.
    If the <type> is omitted, it is inferred from the URI extension.
    <URI> is interpreted according to the <type> as follows:
        - `sql`: path to an SQL database file
        - `json`: path to a JSON file
        - `archive`: path to a .bktgz archive

    Valid <type> values are: {', '.join(_VALID_READERS)}.
    """,
)
@click.option("--merge", "-m", is_flag=True, default=False, help="Merge all readouts.")
def write(ctx, readout_specs: Iterable[str], merge: bool):
    ctx.obj = ctx.obj or {}
    readouts = get_readouts_from_spec(*readout_specs)

    if merge:
        readouts = [MergeReadout(*readouts)]

    ctx.obj["readouts"] = readouts


@write.command()
@click.pass_context
@click.option(
    "--output",
    "-o",
    help="Path to output the JSON",
    required=True,
    type=click.Path(path_type=Path),
)
def json(ctx, output: Path):
    readouts = ctx.obj["readouts"]
    writer = JSONAccessor(output).writer()

    for readout in readouts:
        writer.write(readout)


@write.command()
@click.pass_context
@click.option(
    "--output",
    "-o",
    help="Path to output the Archive",
    required=True,
    type=click.Path(path_type=Path),
)
def archive(ctx, output: Path):
    readouts = ctx.obj["readouts"]
    writer = ArchiveAccessor(output).writer()

    for readout in readouts:
        writer.write(readout)


@write.command()
@click.pass_context
@click.option(
    "--output",
    "-o",
    help="Path to output the SQL",
    required=True,
    type=click.Path(path_type=Path),
)
def sql(ctx, output: Path):
    readouts = ctx.obj["readouts"]
    writer = SQLAccessor.File(output).writer()

    for readout in readouts:
        writer.write(readout)


@write.command()
@click.pass_context
@click.option(
    "--output",
    "-o",
    help="Path to output the HTML report",
    required=True,
    type=click.Path(path_type=Path),
)
def html(ctx, output: Path):
    readouts = ctx.obj["readouts"]
    web_path = ctx.obj["web_path"]
    writer = HTMLWriter(web_path, output)

    for readout in readouts:
        writer.write(readout)


@write.command()
@click.pass_context
@click.option("--axes/--no-axes", default=False)
@click.option("--goals/--no-goals", default=False)
@click.option("--points/--no-points", default=False)
@click.option("--summary/--no-summary", default=True)
def console(
    ctx,
    axes: bool,
    goals: bool,
    points: bool,
    summary: bool,
):
    readouts = ctx.obj["readouts"]
    writer = ConsoleWriter(axes=axes, goals=goals, points=points, summary=summary)
    for readout in readouts:
        writer.write(readout)


@cli.command()
@click.option(
    "--input",
    "-i",
    "input_paths",
    multiple=True,
    required=True,
    type=click.Path(exists=True, readable=True, path_type=Path),
    help="SQLite database file to merge. Can be specified multiple times.",
)
@click.option(
    "--output",
    "-o",
    required=True,
    type=click.Path(path_type=Path),
    help="Path where the merged SQLite database will be created.",
)
@click.option(
    "--source",
    "-s",
    default=None,
    type=str,
    help="Source identifier for the merged run (default: 'Merged_TIMESTAMP').",
)
@click.option(
    "--source-key",
    "-k",
    default=None,
    type=str,
    help="Source key for the merged run (default: empty string).",
)
@click.option(
    "--verbose",
    "-v",
    is_flag=True,
    default=False,
    help="Enable verbose logging.",
)
def merge_sql(
    input_paths: tuple[Path, ...],
    output: Path,
    source: str | None,
    source_key: str | None,
    verbose: bool,
):
    """
    Directly merge multiple SQLite coverage databases into a single database.

    This command efficiently combines coverage data from multiple SQLite databases
    without loading everything into Python memory. It's optimized for large-scale
    regression merges with many test runs.

    All input databases must have:
    - The same coverage definition (same SHA)
    - Valid bucket coverage database schema

    The merge process:
    1. Validates SHA compatibility across all databases
    2. Copies definition data (once, since it's identical)
    3. Sums bucket hit counts across all runs
    4. Recomputes point hit statistics from merged buckets
    5. Creates a single merged run record

    Example usage:
        bucket merge-sql -i test1.db -i test2.db -i test3.db -o merged.db
        bucket merge-sql -i db/*.db -o merged.db --source "Nightly_Regression"
    """
    import logging

    if verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)

    if len(input_paths) < 1:
        raise click.UsageError("At least one input database must be specified")

    # Validate all inputs are SQLite files
    for path in input_paths:
        if not str(path).endswith(".db"):
            click.echo(
                f"Warning: {path} does not have .db extension, may not be a SQLite database",
                err=True,
            )

    try:
        click.echo(f"Merging {len(input_paths)} databases...")
        run_id = merge_sql_direct(
            output,
            *input_paths,
            source=source,
            source_key=source_key,
        )
        click.echo(f"✓ Successfully merged into {output}")
        click.echo(f"  Run ID: {run_id}")
        if source:
            click.echo(f"  Source: {source}")
        if source_key:
            click.echo(f"  Source Key: {source_key}")
    except Exception as e:
        click.echo(f"✗ Merge failed: {e}", err=True)
        raise click.Abort()


if __name__ == "__main__":
    cli()
