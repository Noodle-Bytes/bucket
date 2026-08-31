# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import os
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path

from .common import Readout, Writer
from .json import JSONWriter

DEFAULT_WEB_PATH = Path(__file__).parent.parent.parent / "viewer"
HOSTED_VIEWER_URL = "https://noodle-bytes.github.io/bucket/"

_VIEWER_FALLBACK = (
    "Export a .bktgz archive and open it in the hosted viewer:\n"
    f"    {HOSTED_VIEWER_URL}\n"
    "or in the desktop app.\n"
    "\n"
    "To generate HTML locally, clone the Bucket repository, run "
    "`npm install` in viewer/, and pass that directory as web_path "
    "(CLI: --web-path)."
)


def require_viewer(web_path: str | Path) -> Path:
    """
    Ensure *web_path* is a viewer checkout with Node.js dependencies.

    The pip package does not include the viewer; HTMLWriter and ReportWriter
    only work from a source checkout (or an explicit --web-path).
    """
    path = Path(web_path)
    if not path.is_dir():
        raise RuntimeError(
            f"Viewer not found at {path}.\n"
            "The pip package (noodle-bucket) does not include the viewer.\n"
            f"{_VIEWER_FALLBACK}"
        )
    try:
        result = subprocess.call(
            ["npm", "ls"],
            cwd=path,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        raise RuntimeError(
            f"Node.js/npm was not found on PATH.\n{_VIEWER_FALLBACK}"
        ) from None
    if result != 0:
        raise RuntimeError(
            "Viewer not installed.\n"
            "If npm is installed: \n"
            "    You may need to run `npm install` in the viewer directory. \n"
            "If npm is not installed: \n"
            "    see https://docs.npmjs.com/downloading-and-installing-node-js-and-npm"
            f"\n\n{_VIEWER_FALLBACK}"
        )
    return path


class HTMLWriter(Writer):
    """
    Write coverage information out to an HTML report.
    """

    def __init__(
        self,
        web_path: str | Path = DEFAULT_WEB_PATH,
        output: str | Path = "index.html",
    ):
        self.web_path = require_viewer(web_path)
        self.output = Path(output)
        self.written = False

    def write(self, readout: Readout | list[Readout]):
        if self.written:
            raise RuntimeError(
                "A new HTMLWriter instance is required for each `write(...)`"
            )

        if not isinstance(readout, list):
            readout = [readout]

        with tempfile.TemporaryDirectory() as tmp:
            json_path = Path(tmp) / "cov.json"
            html_path = Path(tmp) / "index.html"
            json_writer = JSONWriter(json_path)
            for a_readout in readout:
                json_writer.write(a_readout)

            process_env = os.environ.copy()
            process_env["BUCKET_CVG_JSON"] = json_path.as_posix()

            bundle_cmd = f"npm run bundle -- --outDir={tmp} --emptyOutDir=false"
            result = subprocess.call(
                shlex.split(bundle_cmd), cwd=self.web_path, env=process_env
            )

            if result != 0:
                raise RuntimeError("Could not build html bundle!")

            shutil.copy(html_path, self.output)
            # Also copy logo.svg if it exists (needed for browser file:// protocol)
            logo_src = self.web_path / "public" / "logo.svg"
            if logo_src.exists():
                logo_dst = self.output.parent / "logo.svg"
                shutil.copy(logo_src, logo_dst)
        self.written = True
