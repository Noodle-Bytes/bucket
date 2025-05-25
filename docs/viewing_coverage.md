<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved
  -->

## Viewing coverage

There are two ways to view the collected coverage.

1) Terminal
2) Browser

---
### Terminal
Bucket is able to print both a summary, or whole tables of coverage collected during a simulation. The summary view can be useful to see how much a test contributed at the end of it's run, or to summarise a regression after merging. This can be shown by running the following:

```Python
    ...
    readout_a = point_reader.read(cvg_a)
    ConsoleWriter().write(readout_a)
    ...
```

`ConsoleWriter` has the following options which can be set to True for more detailed information:
|Parameter| Default | Description|
|--|--|--|
|axes|False|Print name and description of all axes for all coverpoints|
|goals|False|Print name and description of all goals for all coverpoints|
|points|False|Print hit count and goal for all buckets for each coverpoint|
|summary|True|Print a summary of hits for each coverpoint in the tree|

Or to read in coverage from a SQL database:
```
python -m bucket write console --sql-path [SQL_DB_PATH] [--axes] [--goals] [--points] [--summary] --record [ID]
```

---

### Web Viewer

The intended way to view coverage is via the web viewer. This allows for simple navigation of the coverage tree, easy identification of hit, partially hit, and unhit coverpoints. Columns can be sorted and filtered to quickly narrow down the coverage you wish to see.

To generate the coverage viewer please run the following command:
```
python -m bucket write html --sql-path ./example.db --output index.html
```

You can then open the created HTML file in your preferred browser.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Main__dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Main__light.png">
  <img alt="Screenshot showing an example covertree loaded into the Bucket viewer" src="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Main__dark.png">
</picture>

Above you can see the initial window when opening. The whole coverage tree is shown along with various hit statistics.
|Statistic| Descrption|
|--|--|
|Goal Targets| Total number of all bucket targets|
|Goal Hits | Total number of hits (capped at each bucket's target)
|Buckets target | Number of targets (not their value, excluding illegal and ignore)|
|Buckets Hit | Number of buckets with at least 1 hit|
|Buckets Full| Number of fully saturated buckets (hits >= target)|

On the left, the navigation menu shows the coverage tree, which can be expanded/collapsed as necessary or searched.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Search__dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Search__light.png">
  <img alt="Screenshot showing searching the covertree for the word 'chew'" src="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Search__dark.png">
</picture>

---
If you click on a coverpoint, the Bucket viewer shows all buckets, the goals, number of hits and hit percentage.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Coverpoint__dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Coverpoint__light.png">
  <img alt="Screenshot showing an example coverpoint" src="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Coverpoint__dark.png">
</picture>

Each of the axis columns and goal names can be filtered to only display the buckets you are interested in. Each column can also be sorted.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Filter__dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Filter__light.png">
  <img alt="Screenshot showing an example coverpoint" src="https://raw.githubusercontent.com/vypercore/bucket/main/.github/images/Filter__dark.png">
</picture>

---
<br>

Prev: [Reading and Writing](reading_and_writing.md)
<br>
---: [Back to index](index.md)
