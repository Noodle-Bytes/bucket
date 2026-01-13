# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import os
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path

from .common import Readout, Writer
from .json import JSONWriter


class HTMLWriter(Writer):
    """
    Write coverage information out to an HTML report.
    """

    def __init__(
        self,
        web_path: str | Path = Path(__file__).parent.parent.parent / "viewer",
        output: str | Path = "index.html",
    ):
        self.web_path = Path(web_path)
        self.output = Path(output)
        self.written = False

        result = subprocess.call(["npm", "ls"], cwd=web_path, stdout=subprocess.DEVNULL)
        if result != 0:
            raise RuntimeError(
                "Viewer not installed.\n"
                "If npm is installed: \n"
                "    You may need to run `npm install` in the viewer directory. \n"
                "If npm is not installed: \n"
                "    see https://docs.npmjs.com/downloading-and-installing-node-js-and-npm"
            )

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
