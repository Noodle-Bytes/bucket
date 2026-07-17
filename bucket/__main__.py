# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

from pathlib import Path
from typing import Iterable

import click

from .rw import (
    ArchiveAccessor,
    ConsoleWriter,
    HTMLWriter,
    JSONAccessor,
    ReportWriter,
    SQLAccessor,
)
from .rw.common import MergeReadout, Readout


@click.group()
@click.pass_context
@click.version_option(package_name="bucket")
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
        elif head == "":
            # `<record>@:<URI>` form — type omitted, infer it from the URI
            typ, uri = None, tail
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
@click.option(
    "--output",
    "-o",
    help="Path to output the HTML coverage report",
    required=True,
    type=click.Path(path_type=Path),
)
@click.option(
    "--max-axis-values",
    "max_axis_values",
    default=64,
    type=click.IntRange(min=0),
    help="Cap on listed values per axis; 0 means unlimited",
)
@click.option(
    "--max-tier",
    "max_tier",
    default=None,
    type=click.IntRange(min=0),
    help="Only include coverpoints with tier <= this value",
)
@click.option(
    "--tags",
    default=None,
    type=str,
    help="Only include coverpoints with at least one of these comma-separated tags",
)
@click.option(
    "--point",
    default=None,
    type=str,
    help="Only include coverpoints matching this dotted-path glob, e.g. 'Pets.dogs*'",
)
def report(
    ctx,
    output: Path,
    max_axis_values: int,
    max_tier: int | None,
    tags: str | None,
    point: str | None,
):
    readouts = ctx.obj["readouts"]
    web_path = ctx.obj["web_path"]
    writer = ReportWriter(
        web_path,
        output,
        max_axis_values=max_axis_values,
        max_tier=max_tier,
        tags=[tag.strip() for tag in tags.split(",") if tag.strip()] if tags else None,
        point=point,
    )

    # A single write: the writer is single-use and all readouts belong in
    # one report document.
    writer.write(list(readouts))


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


if __name__ == "__main__":
    cli()
