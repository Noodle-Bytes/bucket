# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Noodle-Bytes. All Rights Reserved

"""
Tests for coverage waivers: specification matching, WaivedReadout scoring,
storage round trips (including legacy SQL databases), merging and console
output.
"""

import json
import sqlite3
import tarfile
from io import StringIO
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from rich.console import Console
from sqlalchemy.inspection import inspect

from bucket import CoverageContext, Covergroup, Coverpoint, Covertop
from bucket.common.exceptions import BucketException
from bucket.rw import (
    ArchiveAccessor,
    ConsoleWriter,
    JSONAccessor,
    SQLAccessor,
    WaivedReadout,
)
from bucket.rw.common import (
    FORMAT_VERSION,
    BucketWaiverTuple,
    CoverageAccess,
    MergeReadout,
    PointHitTuple,
)
from bucket.rw.point import PointReader
from bucket.rw.sql import PointHitRow
from bucket.waiver import (
    Waiver,
    WaiverAxisError,
    WaiverError,
    WaiverFile,
    iter_point_paths,
    load_waivers,
    match_waivers,
)

from .test_rw.test_console import check_readout
from .utils import GeneratedReadout, readouts_are_equal

###############################################################################
# A small covertree with named points and axes, plus illegal/ignore goals
###############################################################################


class Colours(Coverpoint):
    NAME = "colours"
    DESCRIPTION = "Colours by size"

    def setup(self, ctx):
        self.add_axis(
            name="colour", values=["red", "green", "blue"], description="Colour"
        )
        self.add_axis(name="size", values=["small", "large"], description="Size")
        self.add_goal("IGNORED", "Not interesting", ignore=True)
        self.add_goal("BANNED", "Never happens", illegal=True)
        self.add_goal("BIG", "Big ones need seeing more", target=3)

    def apply_goals(self, bucket, goals):
        if bucket.colour.name == "blue" and bucket.size.name == "large":
            return goals.IGNORED
        if bucket.colour.name == "green" and bucket.size.name == "small":
            return goals.BANNED
        if bucket.size.name == "large":
            return goals.BIG

    def sample(self, trace):
        self.bucket.clear()
        self.bucket.set_axes(colour=trace.colour, size=trace.size)
        self.bucket.hit()


class Shapes(Coverpoint):
    NAME = "shapes"
    DESCRIPTION = "Shapes"

    def setup(self, ctx):
        self.add_axis(name="shape", values=["circle", "square"], description="Shape")

    def sample(self, trace):
        self.bucket.clear()
        self.bucket.set_axes(shape=trace.shape)
        self.bucket.hit()


class Inner(Covergroup):
    NAME = "inner"
    DESCRIPTION = "Inner group"

    def setup(self, ctx):
        self.add_coverpoint(Colours())
        self.add_coverpoint(Shapes())


class Top(Covertop):
    NAME = "Top"
    DESCRIPTION = "Top of the tree"

    def setup(self, ctx):
        self.add_covergroup(Inner())
        self.add_coverpoint(
            Shapes(), name="top_shapes", description="Shapes at the top"
        )


def trace(colour, size, shape):
    return SimpleNamespace(colour=colour, size=size, shape=shape)


# Buckets without an explicit goal get the default target.
DEFAULT_TARGET = 10

# colours - red/small: 1 hit (target 10); red/large: 2 hits (target 3);
# green/large: 3 hits (target 3, full); blue/small: unhit (target 10);
# green/small is illegal and blue/large is ignored. Point target 26 over 4
# buckets, 6 hits, 3 hit buckets, 1 full bucket.
# Both shapes points - circle 5 hits, square 1 hit (target 10 each): point
# target 20 over 2 buckets, 6 hits, 2 hit buckets, 0 full buckets.
TRACES = [
    trace("red", "small", "circle"),
    trace("red", "large", "circle"),
    trace("red", "large", "square"),
    trace("green", "large", "circle"),
    trace("green", "large", "circle"),
    trace("green", "large", "circle"),
]


def build_readout(traces=TRACES):
    with CoverageContext():
        cvg = Top()
    for item in traces:
        cvg.sample(item)
    return PointReader("rec-sha").read(cvg)


def find_bucket(readout, point_name, **axis_values):
    """The BucketAccess of the named coverpoint with exactly these axis values."""
    for point in CoverageAccess(readout).points():
        if point.is_group or point.name != point_name:
            continue
        for bucket in point.buckets():
            if bucket.axis_values == axis_values:
                return bucket
    raise KeyError((point_name, axis_values))


def bucket_index(readout, point_name, **axis_values) -> int:
    return find_bucket(readout, point_name, **axis_values).start


def point_hit(readout, point_name) -> PointHitTuple:
    for point, hit in zip(readout.iter_points(), readout.iter_point_hits()):
        if point.name == point_name:
            return hit
    raise KeyError(point_name)


def waiver_file(*specs) -> WaiverFile:
    return WaiverFile(waivers=[Waiver(**spec) for spec in specs])


def matched(readout, *specs) -> dict[int, str]:
    return {w.start: w.reason for w in match_waivers(readout, waiver_file(*specs))}


@pytest.fixture
def readout():
    return build_readout()


@pytest.fixture
def colours(readout):
    """Bucket indices of the colours coverpoint keyed by (colour, size)."""
    return {
        (colour, size): bucket_index(readout, "colours", colour=colour, size=size)
        for colour in ("red", "green", "blue")
        for size in ("small", "large")
    }


###############################################################################
# Specification model
###############################################################################


class TestWaiverModel:
    def test_reason_is_required_and_non_blank(self):
        with pytest.raises(ValidationError):
            Waiver(point="Top")
        with pytest.raises(ValidationError):
            Waiver(point="Top", reason="")
        with pytest.raises(ValidationError):
            Waiver(point="Top", reason="  \n ")

    def test_reason_and_author_are_single_line(self):
        waiver = Waiver(point="Top", reason="line one\n  line two", author=" me\n")
        assert waiver.reason == "line one line two"
        assert waiver.author == "me"

    def test_axes_accept_str_or_list_and_reject_empty_lists(self):
        waiver = Waiver(
            point="Top", axes={"colour": "Red", "size": ["Small", "LARGE"]}, reason="r"
        )
        assert waiver.axis_patterns() == {"colour": ["red"], "size": ["small", "large"]}
        with pytest.raises(ValidationError):
            Waiver(point="Top", axes={"colour": []}, reason="r")

    def test_defaults(self):
        waiver = Waiver(point="Top", reason="r")
        assert waiver.axes == {}
        assert waiver.author == ""
        assert waiver.disabled is False

    def test_load_waivers(self, tmp_path):
        path = tmp_path / "waivers.json"
        path.write_text(
            json.dumps(
                {
                    "waivers": [
                        {"point": "Top.*", "reason": "everything"},
                        {
                            "point": "Top.inner.colours",
                            "axes": {"colour": ["red", "blue"]},
                            "reason": "some",
                            "author": "tester",
                        },
                    ]
                }
            ),
            encoding="utf-8",
        )
        loaded = load_waivers(path)
        assert [w.point for w in loaded.waivers] == ["Top.*", "Top.inner.colours"]
        assert loaded.waivers[1].axis_patterns() == {"colour": ["red", "blue"]}
        assert loaded.waivers[1].author == "tester"

    def test_load_waivers_rejects_invalid_file(self, tmp_path):
        path = tmp_path / "waivers.json"
        path.write_text(json.dumps({"waivers": [{"point": "Top"}]}), encoding="utf-8")
        with pytest.raises(ValidationError):
            load_waivers(path)


###############################################################################
# Matching
###############################################################################


class TestMatching:
    def test_point_paths_join_ancestor_names(self, readout):
        points = list(readout.iter_points())
        paths = list(iter_point_paths(readout))
        assert [index for _, index, _ in paths] == list(range(len(points)))
        assert {points[index].name: (path, depth) for path, index, depth in paths} == {
            "Top": ("Top", 0),
            "top_shapes": ("Top.top_shapes", 1),
            "inner": ("Top.inner", 1),
            "colours": ("Top.inner.colours", 2),
            "shapes": ("Top.inner.shapes", 2),
        }

    def test_point_and_axis_globs_are_case_insensitive(self, readout, colours):
        result = matched(
            readout,
            {"point": "top.INNER.Colours", "axes": {"colour": "RED"}, "reason": "r"},
        )
        assert result == {
            colours["red", "small"]: "r",
            colours["red", "large"]: "r",
        }

    def test_every_listed_axis_must_match(self, readout, colours):
        result = matched(
            readout,
            {
                "point": "Top.inner.colours",
                "axes": {"colour": ["red", "blue"], "size": "l*"},
                "reason": "r",
            },
        )
        # blue/large is an ignore bucket so only red/large remains.
        assert result == {colours["red", "large"]: "r"}

    def test_axis_patterns_are_globs(self, readout, colours):
        result = matched(
            readout,
            {"point": "Top.inner.colours", "axes": {"colour": "?????"}, "reason": "r"},
        )
        # "green" is the only five-letter colour; green/small is illegal.
        assert result == {colours["green", "large"]: "r"}

    def test_empty_axes_waive_every_targeted_bucket(self, readout, colours):
        result = matched(readout, {"point": "Top.inner.colours", "reason": "r"})
        assert set(result) == {
            colours["red", "small"],
            colours["red", "large"],
            colours["green", "large"],
            colours["blue", "small"],
        }

    def test_illegal_and_ignore_buckets_are_never_waived(self, readout):
        assert (
            matched(
                readout,
                {
                    "point": "Top.inner.colours",
                    "axes": {"colour": "green", "size": "small"},
                    "reason": "illegal",
                },
            )
            == {}
        )
        assert (
            matched(
                readout,
                {
                    "point": "Top.inner.colours",
                    "axes": {"colour": "blue", "size": "large"},
                    "reason": "ignore",
                },
            )
            == {}
        )

    def test_group_path_waives_whole_subtree(self, readout):
        result = matched(readout, {"point": "Top.inner", "reason": "r"})
        colours_range = range(
            *next(
                (p.bucket_start, p.bucket_end)
                for p in readout.iter_points()
                if p.name == "colours"
            )
        )
        shapes_range = range(
            *next(
                (p.bucket_start, p.bucket_end)
                for p in readout.iter_points()
                if p.name == "shapes"
            )
        )
        assert len(result) == 6
        assert len(set(result) & set(colours_range)) == 4
        assert set(shapes_range) <= set(result)

    def test_wildcards_match_across_dots(self, readout):
        both_shapes = matched(readout, {"point": "*shapes", "reason": "r"})
        assert len(both_shapes) == 4  # inner.shapes and top_shapes, 2 buckets each
        everything = matched(readout, {"point": "*", "reason": "r"})
        assert len(everything) == 8  # 4 colours + 2 + 2 shapes

    def test_first_matching_waiver_wins(self, readout, colours):
        result = matched(
            readout,
            {
                "point": "Top.inner.colours",
                "axes": {"colour": "red", "size": "small"},
                "reason": "first",
            },
            {
                "point": "Top.inner.colours",
                "axes": {"colour": "red"},
                "reason": "second",
            },
        )
        assert result == {
            colours["red", "small"]: "first",
            colours["red", "large"]: "second",
        }

    def test_unknown_axis_raises(self, readout):
        with pytest.raises(WaiverAxisError) as excinfo:
            match_waivers(
                readout,
                waiver_file(
                    {
                        "point": "Top.inner.shapes",
                        "axes": {"colour": "red"},
                        "reason": "r",
                    }
                ),
            )
        assert isinstance(excinfo.value, WaiverError)
        assert isinstance(excinfo.value, BucketException)
        assert "colour" in str(excinfo.value)
        assert "Top.inner.shapes" in str(excinfo.value)

    def test_unknown_axis_on_any_point_in_subtree_raises(self, readout):
        # "Top.inner" also selects the shapes coverpoint, which has no colour axis.
        with pytest.raises(WaiverAxisError):
            match_waivers(
                readout,
                waiver_file(
                    {"point": "Top.inner", "axes": {"colour": "red"}, "reason": "r"}
                ),
            )

    def test_unmatched_point_is_not_an_error(self, readout):
        assert matched(readout, {"point": "Nowhere.*", "reason": "r"}) == {}
        assert match_waivers(readout, WaiverFile(waivers=[])) == []

    def test_disabled_waiver_is_skipped(self, readout):
        assert (
            matched(
                readout, {"point": "*", "reason": "temporarily off", "disabled": True}
            )
            == {}
        )

    def test_result_is_ordered_by_bucket_index(self, readout):
        result = match_waivers(readout, waiver_file({"point": "*", "reason": "r"}))
        assert [w.start for w in result] == sorted(w.start for w in result)
        assert all(isinstance(w, BucketWaiverTuple) for w in result)


###############################################################################
# WaivedReadout scoring
###############################################################################


RED_LARGE = {
    "point": "Top.inner.colours",
    "axes": {"colour": "red", "size": "large"},
    "reason": "Large red things are covered elsewhere",
}


class TestWaivedReadout:
    def test_unwaived_baseline(self, readout):
        assert (
            find_bucket(readout, "colours", colour="red", size="small").target
            == DEFAULT_TARGET
        )
        hit = point_hit(readout, "colours")
        assert hit == PointHitTuple(hit.start, hit.depth, 6, 3, 1, 0, 0)
        hit = point_hit(readout, "top_shapes")
        assert hit == PointHitTuple(hit.start, hit.depth, 6, 2, 0, 0, 0)

    def test_waived_bucket_is_excluded_from_scoring(self, readout, colours):
        waived = WaivedReadout(readout, waiver_file(RED_LARGE))

        assert list(waived.iter_bucket_waivers()) == [
            BucketWaiverTuple(colours["red", "large"], RED_LARGE["reason"])
        ]
        assert waived.matched == list(waived.iter_bucket_waivers())

        # red/large had 2 hits towards a target of 3.
        colours_hit = point_hit(waived, "colours")
        assert (
            colours_hit.hits,
            colours_hit.hit_buckets,
            colours_hit.full_buckets,
        ) == (
            4,
            2,
            1,
        )
        assert (colours_hit.waived_buckets, colours_hit.waived_target) == (1, 3)

        # Groups aggregate their children: shapes contribute 6 hits each.
        inner_hit = point_hit(waived, "inner")
        assert (inner_hit.hits, inner_hit.waived_buckets, inner_hit.waived_target) == (
            10,
            1,
            3,
        )
        top_hit = point_hit(waived, "Top")
        assert (top_hit.hits, top_hit.waived_buckets, top_hit.waived_target) == (
            16,
            1,
            3,
        )
        shapes_hit = point_hit(waived, "top_shapes")
        assert (shapes_hit.waived_buckets, shapes_hit.waived_target) == (0, 0)

    def test_identity_and_definition_pass_through(self, readout):
        waived = WaivedReadout(readout, waiver_file(RED_LARGE))
        assert waived.get_rec_sha() == readout.get_rec_sha()
        assert waived.get_def_sha() == readout.get_def_sha()
        assert waived.get_source() == readout.get_source()
        assert waived.get_source_key() == readout.get_source_key()
        assert waived.get_bucket_version() == readout.get_bucket_version()
        assert waived.get_format_version() == FORMAT_VERSION
        for fn in (
            "iter_points",
            "iter_axes",
            "iter_axis_values",
            "iter_goals",
            "iter_bucket_goals",
            "iter_bucket_hits",
        ):
            assert list(getattr(waived, fn)()) == list(getattr(readout, fn)())

    def test_range_arguments(self, readout, colours):
        waived = WaivedReadout(readout, waiver_file({"point": "*", "reason": "r"}))
        index = colours["red", "large"]
        assert [w.start for w in waived.iter_bucket_waivers(index, index + 1)] == [
            index
        ]
        assert [w.start for w in waived.iter_bucket_waivers(index + 1)] == [
            w.start for w in waived.iter_bucket_waivers() if w.start > index
        ]
        assert [ph.start for ph in waived.iter_point_hits(1, 2, depth=2)] == [1]

    def test_accessors_use_effective_targets(self, readout, colours):
        waived = WaivedReadout(readout, waiver_file(RED_LARGE))
        points = {p.name: p for p in CoverageAccess(waived).points()}
        point = points["colours"]

        assert (point.target, point.target_waived, point.target_effective) == (
            26,
            3,
            23,
        )
        assert (
            point.buckets_targeted,
            point.buckets_waived,
            point.buckets_targeted_effective,
        ) == (4, 1, 3)
        assert point.hits == 4
        assert point.hit_percent == "17.39%"  # 4 / 23
        assert point.buckets_hit_percent == "66.67%"  # 2 / 3
        assert point.buckets_full_percent == "33.33%"  # 1 / 3

        buckets = {b.start: b for b in point.buckets()}
        waived_bucket = buckets[colours["red", "large"]]
        assert waived_bucket.is_waived
        assert waived_bucket.waiver_reason == RED_LARGE["reason"]
        assert waived_bucket.hits == 2  # raw hits still visible
        for index, bucket in buckets.items():
            if index != colours["red", "large"]:
                assert not bucket.is_waived
                assert bucket.waiver_reason is None

        # Unwaived points are unchanged.
        assert points["top_shapes"].buckets_waived == 0
        assert points["top_shapes"].target_effective == 20
        assert points["top_shapes"].hit_percent == "30.00%"  # 6 / 20

    def test_waiving_every_bucket_reads_fully_covered(self, readout):
        waived = WaivedReadout(readout, waiver_file({"point": "*", "reason": "all"}))
        for point in CoverageAccess(waived).points():
            assert point.hits == 0
            assert point.target_effective == 0
            assert point.buckets_targeted_effective == 0
            assert point.hit_ratio == 1
            assert point.hit_percent == "100.00%"
            assert point.buckets_hit_percent == "100.00%"
            assert point.buckets_full_percent == "100.00%"

    def test_existing_waivers_keep_their_reason(self, readout, colours):
        first = WaivedReadout(
            readout,
            waiver_file(
                {
                    "point": "Top.inner.colours",
                    "axes": {"colour": "red", "size": "small"},
                    "reason": "original",
                }
            ),
        )
        second = WaivedReadout(
            first,
            waiver_file(
                {
                    "point": "Top.inner.colours",
                    "axes": {"colour": "red"},
                    "reason": "later",
                },
                {
                    "point": "Top.inner.colours",
                    "axes": {"colour": "blue"},
                    "reason": "blue",
                },
            ),
        )
        assert {w.start: w.reason for w in second.iter_bucket_waivers()} == {
            colours["red", "small"]: "original",
            colours["red", "large"]: "later",
            colours["blue", "small"]: "blue",
        }
        assert [w.start for w in second.matched] == sorted(
            [colours["red", "large"], colours["blue", "small"]]
        )
        colours_hit = point_hit(second, "colours")
        assert (colours_hit.waived_buckets, colours_hit.waived_target) == (3, 23)
        assert colours_hit.hits == 3  # only green/large remains

    def test_unknown_axis_propagates(self, readout):
        with pytest.raises(WaiverAxisError):
            WaivedReadout(
                readout,
                waiver_file(
                    {"point": "Top.top_shapes", "axes": {"size": "*"}, "reason": "r"}
                ),
            )


###############################################################################
# Storage round trips
###############################################################################


ACCESSORS = [
    pytest.param(lambda p: ArchiveAccessor(p / "storage.bktgz"), id="archive"),
    pytest.param(lambda p: JSONAccessor(p / "storage.json"), id="json"),
    pytest.param(lambda p: SQLAccessor.File(p / "storage.db"), id="sql"),
]


def assert_waivers_roundtrip(away, back):
    assert list(back.iter_bucket_waivers()) == []
    assert list(back.iter_point_hits()) == [
        PointHitTuple(*ph[:5]) for ph in away.iter_point_hits()
    ]
    assert list(back.iter_bucket_hits()) == list(away.iter_bucket_hits())
    assert back.get_format_version() == FORMAT_VERSION


@pytest.mark.parametrize("make_accessor", ACCESSORS)
class TestRoundTrip:
    def test_waived_readout_roundtrip(self, tmp_path, make_accessor, readout):
        accessor = make_accessor(tmp_path)
        away = WaivedReadout(readout, waiver_file(RED_LARGE))
        ref = accessor.write(away)
        assert_waivers_roundtrip(away, accessor.read(ref))

    def test_generated_readout_with_awkward_reasons(self, tmp_path, make_accessor):
        accessor = make_accessor(tmp_path)
        away = GeneratedReadout(def_seed=3, rec_seed=3)
        first, second, *_ = away.waivable_buckets()
        away.waive_buckets(
            {
                first: 'Reason №1 with "quotes", commas ✓',
                second: "1234",  # numeric-looking reasons stay strings
            }
        )
        ref = accessor.write(away)
        back = accessor.read(ref)
        assert_waivers_roundtrip(away, back)

    def test_multiple_records_keep_their_own_waivers(self, tmp_path, make_accessor):
        accessor = make_accessor(tmp_path)
        plain = GeneratedReadout(def_seed=4, rec_seed=4)
        waived = GeneratedReadout(def_seed=4, rec_seed=5)
        waived.waive_buckets({waived.waivable_buckets()[0]: "only here"})
        refs = [accessor.write(plain), accessor.write(waived), accessor.write(plain)]
        assert list(accessor.read(refs[0]).iter_bucket_waivers()) == []
        assert list(accessor.read(refs[1]).iter_bucket_waivers()) == []
        assert list(accessor.read(refs[2]).iter_bucket_waivers()) == []
        assert_waivers_roundtrip(waived, accessor.read(refs[1]))

    def test_serialized_layout_has_no_waiver_storage(
        self, tmp_path, make_accessor, readout
    ):
        waived = WaivedReadout(readout, waiver_file(RED_LARGE))

        archive_path = tmp_path / "storage.bktgz"
        ArchiveAccessor(archive_path).write(waived)
        with tarfile.open(archive_path, "r:gz") as archive:
            assert "bucket_waiver" not in archive.getnames()

        json_path = tmp_path / "storage.json"
        JSONAccessor(json_path).write(waived)
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        assert "bucket_waiver" not in payload["tables"]
        assert "bucket_waiver" not in payload["records"][0]
        assert all(len(row) == 5 for row in payload["records"][0]["point_hit"])

        sql = SQLAccessor.File(tmp_path / "storage.db")
        sql.write(waived)
        assert not inspect(sql.engine).has_table("bucket_waiver")
        assert not {"waived_buckets", "waived_target"} & sql_columns(
            sql, PointHitRow.__tablename__
        )


LEGACY_POINT_HIT_DDL = (
    "CREATE TABLE point_hit ("
    "run INTEGER NOT NULL, start INTEGER NOT NULL, depth INTEGER NOT NULL, "
    "hits INTEGER, hit_buckets INTEGER, full_buckets INTEGER, "
    "PRIMARY KEY (run, start, depth))"
)


def sql_columns(accessor, table) -> set[str]:
    return {column["name"] for column in inspect(accessor.engine).get_columns(table)}


class TestLegacySQL:
    def test_writing_into_a_legacy_database_does_not_add_waiver_storage(
        self, tmp_path, readout
    ):
        path = tmp_path / "legacy.db"
        with sqlite3.connect(path) as connection:
            connection.execute(LEGACY_POINT_HIT_DDL)

        accessor = SQLAccessor.File(path)
        assert not {"waived_buckets", "waived_target"} & sql_columns(
            accessor, PointHitRow.__tablename__
        )

        away = WaivedReadout(readout, waiver_file(RED_LARGE))
        ref = accessor.write(away)

        assert not {"waived_buckets", "waived_target"} & sql_columns(
            accessor, PointHitRow.__tablename__
        )
        assert not inspect(accessor.engine).has_table("bucket_waiver")
        assert_waivers_roundtrip(away, accessor.read(ref))

    @pytest.mark.skipif(
        tuple(int(x) for x in sqlite3.sqlite_version.split(".")[:2]) < (3, 35),
        reason="ALTER TABLE DROP COLUMN needs SQLite 3.35",
    )
    def test_reading_legacy_waiver_columns_defaults_waivers(self, tmp_path, readout):
        path = tmp_path / "legacy.db"
        ref = SQLAccessor.File(path).write(readout)
        with sqlite3.connect(path) as connection:
            connection.execute(
                "ALTER TABLE point_hit ADD COLUMN waived_buckets INTEGER NOT NULL DEFAULT 0"
            )
            connection.execute(
                "ALTER TABLE point_hit ADD COLUMN waived_target INTEGER NOT NULL DEFAULT 0"
            )
            connection.execute(
                "CREATE TABLE bucket_waiver "
                "(run INTEGER, start INTEGER, reason TEXT)"
            )
            connection.execute(
                "INSERT INTO bucket_waiver VALUES (?, ?, ?)", (ref, 0, "legacy")
            )

        accessor = SQLAccessor.File(path)
        back = accessor.read(ref)
        assert readouts_are_equal(readout, back)
        assert list(back.iter_bucket_waivers()) == []
        assert all(
            (ph.waived_buckets, ph.waived_target) == (0, 0)
            for ph in back.iter_point_hits()
        )

        # Subsequent writes continue to ignore legacy waiver storage.
        away = WaivedReadout(readout, waiver_file(RED_LARGE))
        assert_waivers_roundtrip(away, accessor.read(accessor.write(away)))
        assert readouts_are_equal(readout, accessor.read(ref))


###############################################################################
# Merging
###############################################################################


class TestMerge:
    def test_merge_unions_waivers_first_reason_wins(self, colours):
        readout_a = WaivedReadout(
            build_readout(),
            waiver_file({**RED_LARGE, "reason": "from a"}),
        )
        readout_b = WaivedReadout(
            build_readout(),
            waiver_file(
                {**RED_LARGE, "reason": "from b"},
                {
                    "point": "Top.inner.colours",
                    "axes": {"colour": "blue"},
                    "reason": "blue from b",
                },
            ),
        )

        merged = MergeReadout(readout_a, readout_b)
        assert {w.start: w.reason for w in merged.iter_bucket_waivers()} == {
            colours["red", "large"]: "from a",
            colours["blue", "small"]: "blue from b",
        }

        # Hits are summed, then rescored with the waivers: red/small 2 of 10,
        # green/large 6 -> capped at 3 (full); red/large (target 3) and
        # blue/small (target 10) waived.
        colours_hit = point_hit(merged, "colours")
        assert colours_hit == PointHitTuple(
            colours_hit.start, colours_hit.depth, 5, 2, 1, 2, 13
        )
        assert merged.get_rec_sha() == readout_a.get_rec_sha()

    def test_merge_of_waived_and_unwaived_records(self, readout, colours):
        waived = WaivedReadout(build_readout(), waiver_file(RED_LARGE))
        merged = MergeReadout(readout, waived)
        assert [w.start for w in merged.iter_bucket_waivers()] == [
            colours["red", "large"]
        ]
        # Merging later still unions.
        merged = MergeReadout(readout)
        assert list(merged.iter_bucket_waivers()) == []
        merged.merge(waived)
        assert [w.start for w in merged.iter_bucket_waivers()] == [
            colours["red", "large"]
        ]
        colours_hit = point_hit(merged, "colours")
        assert (colours_hit.waived_buckets, colours_hit.waived_target) == (1, 3)

    def test_merge_roundtrips_through_archive(self, tmp_path, colours):
        waived = WaivedReadout(build_readout(), waiver_file(RED_LARGE))
        path = tmp_path / "regr.bktgz"
        ArchiveAccessor(path).write(waived)
        ArchiveAccessor(path).write(build_readout())
        merged = ArchiveAccessor.merge_files([path])
        assert list(merged.iter_bucket_waivers()) == []
        out = tmp_path / "merged.bktgz"
        ArchiveAccessor(out).write(merged)
        assert_waivers_roundtrip(merged, next(ArchiveAccessor(out).read_all()))


###############################################################################
# Console
###############################################################################


class TestConsole:
    def render(self, readout, **options) -> str:
        output = StringIO()
        console = Console(file=output, width=1000, legacy_windows=False, _environ={})
        ConsoleWriter(console=console, **options).write(readout)
        return output.getvalue()

    def test_summary_shows_waived_column_and_effective_percentages(self, readout):
        waived = WaivedReadout(readout, waiver_file(RED_LARGE))
        text = self.render(waived)
        assert "Waived" in text
        colours_line = next(
            line for line in text.splitlines() if "colours" in line and "│" in line
        )
        cells = [cell.strip() for cell in colours_line.split("│") if cell.strip()]
        # Name, Description, Target, Hits, Hits %, Target Buckets, Waived,
        # Hit Buckets, Full Buckets, Hit %, Full %
        assert cells[2:] == [
            "26",
            "4",
            "17.39%",
            "4",
            "1",
            "2",
            "1",
            "66.67%",
            "33.33%",
        ]

    def test_point_table_shows_reason(self, readout):
        waived = WaivedReadout(readout, waiver_file(RED_LARGE))
        text = self.render(waived, points=True, summary=False)
        assert RED_LARGE["reason"] in text

    def test_tables_stay_consistent_with_accessors(self, readout):
        waived = WaivedReadout(readout, waiver_file(RED_LARGE))
        check_readout(waived, points=True, axes=True, goals=True, summary=True)
        generated = GeneratedReadout(min_points=3, max_points=6, max_axis_values=3)
        generated.waive_buckets(
            {index: f"reason {index}" for index in generated.waivable_buckets()[::3]}
        )
        check_readout(generated, points=True, summary=True)
