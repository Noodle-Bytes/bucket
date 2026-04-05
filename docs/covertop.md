<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved
  -->

<!--
  ~ SPDX-License-Identifier: MIT
  ~ Copyright (c) 2023-2025 Vypercore. All Rights Reserved
  -->

## Covertop

`Covertop` is a type of covergroup reserved for the very top of coverage. This class contains special functions such as filtering, sample and process_trace. This is the coverage instance that you will instance in your testbench.

NOTE: The top of coverage should have a default name provided, and cannot be overridden when instancing. A description should also be added if it is used.

When instancing a Covertop class, you can optionally pass in an instance of logging.Logger. Bucket will then create a child instance to use. If not passed in, then Bucket will create it's own instance of Logger to use. There are some info and debug level messages which you may find useful, and illegal bins will report ERROR when hit.

Bucket also has configuration parameters which may be useful to users:
| Config option | Description |
|---|---|
| verbosity | Change the verbosity of the logger. Can also be passed in as either a integer, logging level or string. (CRITICAL, ERROR, WARNING, INFO, DEBUG) |
| except_on_illegal | Default is False. When set to True, illegal buckets will raise an exception instead of just printing out an ERROR message |



### Sampling coverage
A trace object should be created, normally from monitors but can also come from other sources such as models. Sampling coverage is done by calling the `sample()` method, and passing in your trace object. An example of this can be seen on the next page.


### Filtering coverage

#### Filtering by function

Coverpoints and Covergroups may be filtered to allow coverage to run quicker. This is useful when working on a small subset of coverage and you don't want to run everything, or for follow-up regressions to exclude already saturated coverpoints. Below are the methods to include, restrict or exclude coverage which match the condition provided.

| Function  | Description |
|---|---|
| `include_by_function()` | Enable coverpoints which match. Unmatched coverpoints will not have their active state changed, except when this is the first filter to be applied, then any coverpoints which do not match are explicitly set to inactive, as the default state is active. |
| `restrict_by_function()` | Restrict to coverpoints which match. Matched coverpoints will not change state. Unmatched will be disabled |
| `exclude_by_function()` |  Disable coverpoints which match. Unmatched coverpoints will not change state |

| Parameter | Type | Description |
| --- | --- | ---|
| matcher | Callable | A function to match against coverpoints/covergroups. Expect a True/False result |

Some additional helper functions have been provided to allow for easy use of common use-cases. You are able mix these with your own match functions as required.

| Functions | Description |
|---|---|
| `include_by_name`<br>`restrict_by_name`<br>`exclude_by_name` | Provide a list of names to match against both coverpoints and covergroups |
| `include_by_tag`<br>`restrict_by_tag`<br>`exclude_by_tag` | Provide a list of tags to match against (either match all or some). Coverpoints only|

When filtering by name, both covergroups and coverpoints are matched so you can enable all children of a covergroup easily. However, filtering by tag only matches against coverpoints, as covergroups will accumulate all of their children's tags and may match unexpectedly.

NOTE: The filters stack in the order they are provided. It is recommended that they are applied in the order of include -> restrict -> exclude, but you are able to layer them in any order you like.

#### Set tier level

| Functions | Description |
|---|---|
| `set_tier_level` | Restrict coverpoints to the requested tier level and below. Lower values are higher priority |

All coverpoints default to tier 0 if they aren't explicitly set and will be enabled by default. This sets the tier level separately to the filter functions. If you want to use `tier` as part of your match criteria you are able to do so with `*_by_function()`.


```
    # Only run branch related coverage which are tier 1 or lower.
    cvg = MyBigCoverGroup(name="my_toplevel_covergroup", description="All of my coverage")
    cvg.include_by_name('branch_coverage')
    cvg.set_tier_level(1)
```
NOTE: The strings/values are hardcoded in the example above, but are intended to come from command line arguments/input files/etc.


### Processing Trace (optional)

If your trace information requires pre-processing before sampling, then you can override the `process_trace()` method, which by default will just return the trace object unmodified.

For example:

``` Python
class MyCoverage(Covertop):
    NAME = "My_coverage"
    DESCRIPTION = "All my coverage"

    ...

    def process_trace(self, trace):
        ...
        # Modify trace object for all coverpoints
        # For example, common calculations may want to be done here, rather
        # than repeated in many coverpoints
        ...
        return trace
```

<!-- Navigation links below are auto-generated by tools/update_docs_nav.py. Do not edit manually. -->
---
<br>

Prev: [Covergroups](covergroups.md)
<br>
Next: [Adding coverage to the testbench](add_to_testbench.md)
