<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

<div align="center">
<img alt="Bucket logo" src="https://raw.githubusercontent.com/Noodle-Bytes/bucket/main/.github/images/Logo-192x192.png">
</div>

# Bucket

Bucket is functional coverage written in Python: define coverpoints once, sample
from simulators, models, or log parsers, then merge, compare, waive, and inspect
results without a commercial EDA tool.

- **Python coverage model** — coverpoints, covergroups, and covertops that fit
  cocotb and other Python testbenches
- **Vendor-independent sampling** — collect hits from DUT traces, reference
  models, or offline parsers
- **Regression workflow** — export `.bktgz` / SQL / JSON, merge runs, compare
  coverage sets, and apply waiver sidecars
- **Viewer** — hosted web app and desktop app for browsing, filtering, and
  comparing coverage

## Install

```bash
pip install noodle-bucket
```

This installs the Python library (`import bucket`) and the `bucket` CLI. That is
enough to write coverpoints, collect coverage, and export `.bktgz` / SQL / JSON /
console output. Open results in the [hosted viewer](https://noodle-bytes.github.io/bucket/)
or the [desktop app](electron/README.md).

Generating standalone HTML (`bucket write html` / `bucket write report`) needs a
source checkout of this repository and Node.js; it is not part of the pip package.

## Documentation

User docs live in [`docs/`](docs/index.md). To browse them locally:

```bash
./bin/shell
mkdocs serve
```

Then open `http://127.0.0.1:8000/`.

## Viewer

- Hosted: https://noodle-bytes.github.io/bucket/
- Desktop app: see [`electron/README.md`](electron/README.md)
- Viewer development: see [`viewer/README.md`](viewer/README.md)

## Support

Bucket is provided as-is under the MIT licence. We are not offering external
support, but the docs and examples are meant to make it straightforward to adopt.

> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Contributions

**We will be introducing a contributor licence agreement in the near future. In the meantime, if you want to contribute please get in touch.**

Please feel free to contribute to the project, following these guidelines:

* Please contribute by creating a fork and submitting a pull request.
* Pull requests should be as small as possible to resolve the issue they are trying to address.
* Pull requests must respect the goals of the library, as stated in the documentation.
* Pull requests should take care not to make performance worse except for cases which require bug fixes.
* Pull requests should update the documentation for any added/changed functionality.
