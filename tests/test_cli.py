# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
Tests for the `bucket` command line interface.
"""

import json
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as pkg_version

import pytest
from click.testing import CliRunner

from bucket import DIST_NAME
from bucket.__main__ import _split_spec, cli
from bucket.rw import ArchiveAccessor, JSONAccessor, SQLAccessor

from .utils import GeneratedReadout, readouts_are_equal


def test_dist_name_matches_the_installed_distribution():
    """
    DIST_NAME backs `bucket --version` and the version stamped into archives.
    If it drifts from the name in pyproject.toml both silently read "unknown"
    rather than failing, so assert it still resolves.
    """
    try:
        pkg_version(DIST_NAME)
    except PackageNotFoundError:
        pytest.fail(
            f"DIST_NAME {DIST_NAME!r} does not match the installed "
            "distribution name; keep it in sync with pyproject.toml"
        )


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


@pytest.fixture
def waivable_archives(tmp_path):
    """
    Like `archives`, but with a definition that actually has buckets (the
    def_seed=1 tree is two empty groups), so waivers have something to match.
    """
    params = dict(
        def_seed=7,
        min_points=2,
        max_points=3,
        max_axes=2,
        max_axis_values=3,
        min_hits=1,
        max_hits=2,
    )
    readout_1 = GeneratedReadout(rec_seed=1, **params)
    readout_2 = GeneratedReadout(rec_seed=2, **params)
    assert readout_1.waivable_buckets()
    path_1 = tmp_path / "regr_1.bktgz"
    path_2 = tmp_path / "regr_2.bktgz"
    ArchiveAccessor(path_1).writer().write(readout_1)
    ArchiveAccessor(path_2).writer().write(readout_2)
    return path_1, path_2, readout_1, readout_2


def write_waivers(path, *waivers):
    path.write_text(json.dumps({"waivers": list(waivers)}), encoding="utf-8")
    return path


@pytest.fixture
def waive_all(tmp_path):
    """A waiver file that excuses every targetable bucket of any readout."""
    return write_waivers(
        tmp_path / "waive_all.json", {"point": "*", "reason": "waive everything"}
    )


class TestCli:
    def run(self, *args):
        return CliRunner().invoke(cli, [str(a) for a in args])

    def test_version(self):
        result = self.run("--version")
        assert result.exit_code == 0
        assert "version" in result.output

    def test_web_path_default_only_advertised_when_it_exists(self):
        """
        The wheel ships no viewer, so on a pip install the --web-path default
        resolves to a site-packages path that cannot exist. Printing it in
        --help reads like a broken install. --web-path is the only option here
        with a default, so `[default:` tracks whether it is advertised.
        """
        from bucket.rw.html import DEFAULT_WEB_PATH

        result = self.run("--help")
        assert result.exit_code == 0
        assert ("[default:" in result.output) == DEFAULT_WEB_PATH.is_dir()

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

    def test_write_with_waivers(self, waivable_archives, tmp_path, waive_all):
        path_1, _, readout_1, _ = waivable_archives
        out = tmp_path / "waived.json"
        result = self.run("write", "-r", path_1, "-w", waive_all, "json", "-o", out)
        assert result.exit_code == 0, result.output

        back = next(JSONAccessor(out).reader().read_all())
        assert back.get_rec_sha() == readout_1.get_rec_sha()
        assert list(back.iter_bucket_waivers()) == []
        payload = json.loads(out.read_text(encoding="utf-8"))
        assert "bucket_waiver" not in payload["tables"]
        assert "bucket_waiver" not in payload["records"][0]
        assert all(len(row) == 5 for row in payload["records"][0]["point_hit"])
        # Waiver-adjusted core scores are written, but waiver metadata is not.
        for point_hit in back.iter_point_hits():
            assert point_hit.hits == 0
            assert point_hit.waived_buckets == 0
            assert point_hit.waived_target == 0

    def test_write_with_waivers_applies_after_merge(self, waivable_archives, tmp_path):
        path_1, path_2, readout_1, _ = waivable_archives
        # GeneratedReadout points are named S<start>D<depth>E<end>; waive the
        # subtree of the root's first child by its dotted path.
        root, child, *_ = readout_1.iter_points()
        waivers = write_waivers(
            tmp_path / "subtree.json",
            {"point": f"{root.name}.{child.name}", "reason": "child subtree"},
        )
        out = tmp_path / "merged.json"
        result = self.run(
            "write", "-r", path_1, "-r", path_2, "-m", "-w", waivers, "json", "-o", out
        )
        assert result.exit_code == 0, result.output

        merged = next(JSONAccessor(out).reader().read_all())
        expected_waived = [
            index
            for index in readout_1.waivable_buckets()
            if child.bucket_start <= index < child.bucket_end
        ]
        assert expected_waived
        assert list(merged.iter_bucket_waivers()) == []
        # Merged hits are the per-bucket sums, untouched by the waivers.
        merged_hits = {bh.start: bh.hits for bh in merged.iter_bucket_hits()}
        assert all(2 <= hits <= 4 for hits in merged_hits.values())

    def test_multiple_waiver_files_are_combined(self, waivable_archives, tmp_path):
        path_1, _, readout_1, _ = waivable_archives
        root, child, *_ = readout_1.iter_points()
        first = write_waivers(
            tmp_path / "first.json",
            {"point": f"{root.name}.{child.name}", "reason": "first file"},
        )
        second = write_waivers(
            tmp_path / "second.json", {"point": "*", "reason": "second file"}
        )
        out = tmp_path / "waived.json"
        result = self.run(
            "write", "-r", path_1, "-w", first, "-w", second, "json", "-o", out
        )
        assert result.exit_code == 0, result.output
        back = next(JSONAccessor(out).reader().read_all())
        assert list(back.iter_bucket_waivers()) == []
        assert all(point_hit.hits == 0 for point_hit in back.iter_point_hits())

    def test_waivers_with_unknown_axis_error_cleanly(self, waivable_archives, tmp_path):
        path_1, *_ = waivable_archives
        waivers = write_waivers(
            tmp_path / "bad_axis.json",
            {"point": "*", "axes": {"no_such_axis": "*"}, "reason": "typo"},
        )
        result = self.run("write", "-r", path_1, "-w", waivers, "console")
        assert result.exit_code != 0
        assert "Could not apply waivers" in result.output
        assert "no_such_axis" in result.output

    def test_invalid_waiver_file_errors_cleanly(self, archives, tmp_path):
        path_1, *_ = archives
        waivers = write_waivers(tmp_path / "no_reason.json", {"point": "*"})
        result = self.run("write", "-r", path_1, "-w", waivers, "console")
        assert result.exit_code != 0
        assert "Could not apply waivers" in result.output

    def test_missing_waiver_file_errors(self, archives, tmp_path):
        path_1, *_ = archives
        result = self.run(
            "write", "-r", path_1, "-w", tmp_path / "missing.json", "console"
        )
        assert result.exit_code != 0

    def test_console_with_waivers_shows_waived_column(
        self, waivable_archives, waive_all
    ):
        path_1, *_ = waivable_archives
        result = self.run("write", "-r", path_1, "-w", waive_all, "console", "--points")
        assert result.exit_code == 0, result.output
        assert "Waived" in result.output
        assert "waive everything" in result.output

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
        assert calls["options"]["max_axis_values"] == 8
        assert calls["options"]["max_tier"] == 1
        assert calls["options"]["tags"] == ["toys", "age"]
        assert calls["options"]["point"] == "Pets.dogs*"
        # All readouts are passed in one single-use write call.
        assert isinstance(calls["readouts"], list)
        assert len(calls["readouts"]) == 1

    def test_write_html_without_viewer_errors_cleanly(self, archives, tmp_path):
        path_1, *_ = archives
        result = self.run(
            "--web-path",
            tmp_path / "no-viewer",
            "write",
            "-r",
            path_1,
            "html",
            "-o",
            tmp_path / "out.html",
        )
        assert result.exit_code != 0
        assert "does not include the viewer" in result.output
        assert "hosted viewer" in result.output

    def test_write_console_does_not_need_viewer(self, archives, tmp_path):
        path_1, *_ = archives
        result = self.run(
            "--web-path",
            tmp_path / "no-viewer",
            "write",
            "-r",
            path_1,
            "console",
        )
        assert result.exit_code == 0
        assert "Summary" in result.output

    def test_missing_file_errors(self, tmp_path):
        result = self.run("write", "-r", tmp_path / "missing.bktgz", "console")
        assert result.exit_code != 0

    def test_unknown_spec_type_errors(self, tmp_path):
        result = self.run("write", "-r", tmp_path / "file.xyz", "console")
        assert result.exit_code != 0
