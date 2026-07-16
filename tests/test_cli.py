# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
Tests for the `bucket` command line interface.
"""

import pytest
from click.testing import CliRunner

from bucket.__main__ import _split_spec, cli
from bucket.rw import ArchiveAccessor, JSONAccessor, SQLAccessor

from .utils import GeneratedReadout, readouts_are_equal


class TestSplitSpec:
    def test_full_spec(self):
        assert _split_spec("2@sql:store.db") == (2, "sql", "store.db")

    def test_record_with_inferred_type(self):
        assert _split_spec("1@:store.bktgz") == (1, "archive", "store.bktgz")

    def test_explicit_type(self):
        assert _split_spec("archive:store") == (None, "archive", "store")
        assert _split_spec("json:store") == (None, "json", "store")
        assert _split_spec("sql:store") == (None, "sql", "store")

    def test_type_inferred_from_extension(self):
        assert _split_spec("store.db") == (None, "sql", "store.db")
        assert _split_spec("store.json") == (None, "json", "store.json")
        assert _split_spec("store.bktgz") == (None, "archive", "store.bktgz")

    def test_unknown_extension_raises(self):
        with pytest.raises(ValueError, match="Could not infer reader type"):
            _split_spec("store.xyz")

    def test_uri_with_colon_but_unknown_head_is_not_a_type(self):
        assert _split_spec("c:/path/store.db") == (None, "sql", "c:/path/store.db")


@pytest.fixture
def archives(tmp_path):
    """Two merge-compatible archives plus their readouts."""
    readout_1 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=1, max_hits=2)
    readout_2 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=2, max_hits=3)
    path_1 = tmp_path / "regr_1.bktgz"
    path_2 = tmp_path / "regr_2.bktgz"
    ArchiveAccessor(path_1).writer().write(readout_1)
    ArchiveAccessor(path_2).writer().write(readout_2)
    return path_1, path_2, readout_1, readout_2


class TestCli:
    def run(self, *args):
        return CliRunner().invoke(cli, [str(a) for a in args])

    def test_version(self):
        result = self.run("--version")
        assert result.exit_code == 0
        assert "version" in result.output

    def test_write_console(self, archives):
        path_1, *_ = archives
        result = self.run("write", "-r", path_1, "console")
        assert result.exit_code == 0
        assert "Summary" in result.output

    def test_write_console_with_all_tables(self, archives):
        path_1, *_ = archives
        result = self.run(
            "write", "-r", path_1, "console", "--axes", "--goals", "--points"
        )
        assert result.exit_code == 0

    def test_write_json_roundtrip(self, archives, tmp_path):
        path_1, _, readout_1, _ = archives
        out = tmp_path / "out.json"
        result = self.run("write", "-r", path_1, "json", "-o", out)
        assert result.exit_code == 0
        read_back = next(JSONAccessor(out).reader().read_all())
        assert readouts_are_equal(readout_1, read_back)

    def test_write_sql_from_json_spec(self, archives, tmp_path):
        path_1, _, readout_1, _ = archives
        json_out = tmp_path / "out.json"
        sql_out = tmp_path / "out.db"
        assert self.run("write", "-r", path_1, "json", "-o", json_out).exit_code == 0
        result = self.run("write", "-r", f"json:{json_out}", "sql", "-o", sql_out)
        assert result.exit_code == 0
        read_back = SQLAccessor.File(sql_out).reader().read(1)
        assert readouts_are_equal(readout_1, read_back)

    def test_write_archive_from_sql_record_spec(self, archives, tmp_path):
        path_1, _, readout_1, _ = archives
        sql_out = tmp_path / "out.db"
        archive_out = tmp_path / "out.bktgz"
        assert self.run("write", "-r", path_1, "sql", "-o", sql_out).exit_code == 0
        result = self.run(
            "write", "-r", f"1@sql:{sql_out}", "archive", "-o", archive_out
        )
        assert result.exit_code == 0
        read_back = next(ArchiveAccessor(archive_out).reader().read_all())
        assert readouts_are_equal(readout_1, read_back)

    def test_write_merge(self, archives, tmp_path):
        path_1, path_2, readout_1, readout_2 = archives
        out = tmp_path / "merged.json"
        result = self.run(
            "write", "-r", path_1, "-r", path_2, "--merge", "json", "-o", out
        )
        assert result.exit_code == 0

        merged = next(JSONAccessor(out).reader().read_all())
        expected_hits = {}
        for readout in (readout_1, readout_2):
            for bucket_hit in readout.iter_bucket_hits():
                expected_hits[bucket_hit.start] = (
                    expected_hits.get(bucket_hit.start, 0) + bucket_hit.hits
                )
        merged_hits = {bh.start: bh.hits for bh in merged.iter_bucket_hits()}
        assert merged_hits == expected_hits

    def test_write_html_uses_html_writer(self, archives, tmp_path, monkeypatch):
        """The html command wires the web path and output into HTMLWriter."""
        import bucket.__main__ as main_module

        path_1, *_ = archives
        out = tmp_path / "report.html"
        calls = {}

        class FakeHTMLWriter:
            def __init__(self, web_path, output):
                calls["web_path"] = web_path
                calls["output"] = output

            def write(self, readout):
                calls.setdefault("readouts", []).append(readout)

        monkeypatch.setattr(main_module, "HTMLWriter", FakeHTMLWriter)
        result = self.run("write", "-r", path_1, "html", "-o", out)
        assert result.exit_code == 0
        assert calls["output"] == out
        assert len(calls["readouts"]) == 1

    def test_write_report_uses_report_writer(self, archives, tmp_path, monkeypatch):
        """The report command wires the output and options into ReportWriter."""
        import bucket.__main__ as main_module

        path_1, *_ = archives
        out = tmp_path / "report.html"
        calls = {}

        class FakeReportWriter:
            def __init__(self, web_path, output, **options):
                calls["web_path"] = web_path
                calls["output"] = output
                calls["options"] = options

            def write(self, readouts):
                calls["readouts"] = readouts

        monkeypatch.setattr(main_module, "ReportWriter", FakeReportWriter)
        result = self.run(
            "write",
            "-r",
            path_1,
            "report",
            "-o",
            out,
            "--no-axis-values",
            "--results",
            "--max-axis-values",
            "8",
            "--max-tier",
            "1",
            "--tags",
            "toys, age",
            "--point",
            "Pets.dogs*",
        )
        assert result.exit_code == 0
        assert calls["output"] == out
        assert calls["options"]["axis_values"] is False
        assert calls["options"]["description"] is True
        assert calls["options"]["results"] is True
        assert calls["options"]["max_axis_values"] == 8
        assert calls["options"]["max_tier"] == 1
        assert calls["options"]["tags"] == ["toys", "age"]
        assert calls["options"]["point"] == "Pets.dogs*"
        # All readouts are passed in one single-use write call.
        assert isinstance(calls["readouts"], list)
        assert len(calls["readouts"]) == 1

    def test_missing_file_errors(self, tmp_path):
        result = self.run("write", "-r", tmp_path / "missing.bktgz", "console")
        assert result.exit_code != 0

    def test_unknown_spec_type_errors(self, tmp_path):
        result = self.run("write", "-r", tmp_path / "file.xyz", "console")
        assert result.exit_code != 0
