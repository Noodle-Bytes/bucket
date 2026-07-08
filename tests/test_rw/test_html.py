# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
Tests for the HTML report writer. The npm invocations are faked so these run
without node or an installed viewer; what is covered is HTMLWriter's own
behaviour (install check, bundle env/failure handling, output copying and the
single-use contract).
"""

import subprocess
from pathlib import Path

import pytest

from bucket.rw import HTMLWriter

from ..utils import GeneratedReadout


class FakeNpm:
    """
    Stand-in for subprocess.call that mimics `npm ls` and `npm run bundle`.
    The bundle step writes an index.html next to the JSON the writer supplies
    via BUCKET_CVG_JSON, exactly where HTMLWriter expects to find it.
    """

    def __init__(self, ls_result=0, bundle_result=0):
        self.ls_result = ls_result
        self.bundle_result = bundle_result
        self.bundle_envs = []

    def __call__(self, args, cwd=None, env=None, **kwargs):
        if args[:2] == ["npm", "ls"]:
            return self.ls_result
        assert args[:3] == ["npm", "run", "bundle"]
        assert env is not None and "BUCKET_CVG_JSON" in env
        self.bundle_envs.append(env["BUCKET_CVG_JSON"])
        if self.bundle_result == 0:
            json_path = Path(env["BUCKET_CVG_JSON"])
            assert json_path.exists(), "bundle must run after the JSON is written"
            (json_path.parent / "index.html").write_text("<html>report</html>")
        return self.bundle_result


@pytest.fixture
def web_path(tmp_path):
    path = tmp_path / "viewer"
    (path / "public").mkdir(parents=True)
    (path / "public" / "logo.svg").write_text("<svg/>")
    return path


class TestHTMLWriter:
    def test_raises_when_viewer_not_installed(self, web_path, monkeypatch):
        monkeypatch.setattr(subprocess, "call", FakeNpm(ls_result=1))
        with pytest.raises(RuntimeError, match="Viewer not installed"):
            HTMLWriter(web_path, "report.html")

    def test_write_produces_report_and_logo(self, web_path, tmp_path, monkeypatch):
        fake_npm = FakeNpm()
        monkeypatch.setattr(subprocess, "call", fake_npm)
        output = tmp_path / "out" / "report.html"
        output.parent.mkdir()

        writer = HTMLWriter(web_path, output)
        writer.write(GeneratedReadout())

        assert output.read_text() == "<html>report</html>"
        assert (output.parent / "logo.svg").exists()
        assert len(fake_npm.bundle_envs) == 1

    def test_write_accepts_list_of_readouts(self, web_path, tmp_path, monkeypatch):
        monkeypatch.setattr(subprocess, "call", FakeNpm())
        output = tmp_path / "report.html"

        writer = HTMLWriter(web_path, output)
        writer.write([GeneratedReadout(rec_seed=1), GeneratedReadout(rec_seed=2)])

        assert output.exists()

    def test_writer_is_single_use(self, web_path, tmp_path, monkeypatch):
        monkeypatch.setattr(subprocess, "call", FakeNpm())
        writer = HTMLWriter(web_path, tmp_path / "report.html")
        writer.write(GeneratedReadout())
        with pytest.raises(RuntimeError, match="new HTMLWriter instance"):
            writer.write(GeneratedReadout())

    def test_bundle_failure_raises(self, web_path, tmp_path, monkeypatch):
        monkeypatch.setattr(subprocess, "call", FakeNpm(bundle_result=1))
        writer = HTMLWriter(web_path, tmp_path / "report.html")
        with pytest.raises(RuntimeError, match="Could not build html bundle"):
            writer.write(GeneratedReadout())
