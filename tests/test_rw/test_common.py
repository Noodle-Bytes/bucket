# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import tempfile
from pathlib import Path

import pytest

from bucket.rw import ArchiveAccessor, JSONAccessor, SQLAccessor
from bucket.rw.common import CoverageAccess, MergeReadout, PuppetReadout, Reader, Writer

from ..utils import GeneratedReadout, readouts_are_equal


class TestCommon:
    def test_full_readout(self):
        """
        Tests correct results for a uniform generated readout where every
        bucket is fully hit
        """
        readout = GeneratedReadout(
            min_goals=(goals := 3),
            max_goals=goals,
            min_axes=(axes := 3),
            max_axes=axes,
            min_axis_values=(axis_values := 3),
            max_axis_values=axis_values,
            min_target=(target := 3),
            max_target=target,
            min_hits=(hits := 3),
            max_hits=hits,
            min_points=(points := 5),
            max_points=points,
            group_initial_chance=0,
        )

        cov = CoverageAccess(readout)

        axis_start = 0
        goal_start = 0
        bucket_start = 0

        for point in cov.points():
            if not point.is_group:
                for axis in point.axes():
                    assert axis.value_end - axis.value_start == axis_values
                    assert axis.point() is point
                    assert axis.start == axis_start
                    axis_start += 1
                assert len(list(point.axes())) == axes

                for goal in point.goals():
                    assert goal.target == target
                    assert goal.point() is point
                    assert goal.start == goal_start
                    goal_start += 1
                assert len(list(point.goals())) == goals

                for bucket in point.buckets():
                    assert bucket.target == target
                    assert bucket.hits == hits
                    assert bucket.hit_ratio == 1
                    assert bucket.hit_percent == "100.00%"
                    assert bucket.point() is point
                    assert bucket.start == bucket_start
                    bucket_start += 1

                assert point.buckets_hit == axis_values**axes
                assert point.buckets_targeted == axis_values**axes
                assert point.buckets_full == axis_values**axes
            else:
                assert point.buckets_hit == points * (axis_values**axes)
                assert point.buckets_targeted == points * (axis_values**axes)
                assert point.buckets_full == points * (axis_values**axes)

            assert point.bucket_full_ratio == 1
            assert point.bucket_hit_ratio == 1
            assert point.hit_ratio == 1
            assert point.buckets_full_percent == "100.00%"
            assert point.buckets_hit_percent == "100.00%"

    def test_half_readout(self):
        """
        Tests correct results for a uniform generated readout where every
        bucket is exactly half hit
        """
        readout = GeneratedReadout(
            min_goals=(goals := 3),
            max_goals=goals,
            min_axes=(axes := 3),
            max_axes=axes,
            min_axis_values=(axis_values := 3),
            max_axis_values=axis_values,
            min_target=(target := 4),
            max_target=target,
            min_hits=(hits := 2),
            max_hits=hits,
            min_points=(points := 5),
            max_points=points,
            group_initial_chance=0,
        )

        cov = CoverageAccess(readout)

        axis_start = 0
        goal_start = 0
        bucket_start = 0

        for point in cov.points():
            if not point.is_group:
                for axis in point.axes():
                    assert axis.value_end - axis.value_start == axis_values
                    assert axis.start == axis_start
                    axis_start += 1
                assert len(list(point.axes())) == axes

                for goal in point.goals():
                    assert goal.target == target
                    assert goal.start == goal_start
                    goal_start += 1
                assert len(list(point.goals())) == goals

                for bucket in point.buckets():
                    assert bucket.target == target
                    assert bucket.hits == hits
                    assert bucket.hit_ratio == 0.5
                    assert bucket.hit_percent == "50.00%"
                    assert bucket.start == bucket_start
                    bucket_start += 1

                assert point.buckets_hit == axis_values**axes
                assert point.buckets_targeted == axis_values**axes
                assert point.buckets_full == 0
            else:
                assert point.buckets_hit == points * (axis_values**axes)
                assert point.buckets_targeted == points * (axis_values**axes)
                assert point.buckets_full == 0

            assert point.bucket_full_ratio == 0
            assert point.bucket_hit_ratio == 1
            assert point.hit_ratio == 0.5
            assert point.buckets_full_percent == "0.00%"
            assert point.buckets_hit_percent == "100.00%"

    def test_mixed_readout(self):
        """
        Tests that results fall within expected bounds for randomly generated
        readout.
        """
        readout = GeneratedReadout(
            min_goals=(min_goals := 1),
            max_goals=(max_goals := 3),
            min_axes=(min_axes := 1),
            max_axes=(max_axes := 3),
            min_axis_values=(min_axis_values := 2),
            max_axis_values=(max_axis_values := 5),
            min_target=(min_target := -1),
            max_target=(max_target := 10),
            min_hits=(min_hits := 0),
            max_hits=(max_hits := 10),
            min_points=1,
            max_points=10,
        )

        cov = CoverageAccess(readout)

        axis_start = 0
        goal_start = 0
        bucket_start = 0

        for point in cov.points():
            if not point.is_group:
                for axis in point.axes():
                    assert (
                        min_axis_values
                        <= (axis.value_end - axis.value_start)
                        <= max_axis_values
                    )
                    assert axis.start == axis_start
                    axis_start += 1
                assert min_axes <= len(list(point.axes())) <= max_axes

                for goal in point.goals():
                    assert min_target <= (goal.target) <= max_target
                    assert goal.start == goal_start
                    goal_start += 1
                assert min_goals <= len(list(point.goals())) <= max_goals

                bucket_count = 0
                for bucket in point.buckets():
                    assert min_target <= bucket.target <= max_target
                    assert min_hits <= bucket.hits <= max_hits
                    assert 0 <= bucket.hit_ratio <= 1
                    bucket_count += 1
                    assert bucket.start == bucket_start
                    bucket_start += 1

                assert (
                    (min_axis_values**min_axes)
                    <= bucket_count
                    <= (max_axis_values**max_axes)
                )
                assert (
                    min_hits * bucket_count
                    <= point.buckets_hit
                    <= max_hits * bucket_count
                )
                assert (
                    min_target * bucket_count
                    <= point.buckets_targeted
                    <= max_target * bucket_count
                )

            assert 0 <= point.bucket_hit_ratio <= 1
            assert 0 <= point.bucket_full_ratio <= 1
            assert 0 <= point.hit_ratio <= 1

    def test_non_legal_point(self):
        """
        Tests specific point edge cases
        """
        readout = GeneratedReadout(min_target=-1, max_target=0, root_is_point=True)
        cov = CoverageAccess(readout)
        points = list(cov.points())
        assert len(points) == 1
        for point in points:
            assert point.target == 0
            assert point.hits == 0
            assert point.hit_ratio == 1
            assert point.bucket_hit_ratio == 1
            assert point.bucket_full_ratio == 1
            assert point.hit_percent == "100.00%"
            assert point.buckets_hit_percent == "100.00%"
            assert point.buckets_full_percent == "100.00%"

    def test_unset_sha(self):
        """
        Tests getting sha from uninitialized puppet readout
        """
        readout = PuppetReadout()
        with pytest.raises(RuntimeError):
            readout.get_def_sha()
        with pytest.raises(RuntimeError):
            readout.get_rec_sha()

    def test_different_covertrees_have_different_hashes(self):
        """
        Tests that two different covertrees produce different hashes
        """
        # Different def_seed should produce different def_sha
        readout_a = GeneratedReadout(def_seed=1, rec_seed=1)
        readout_b = GeneratedReadout(def_seed=2, rec_seed=1)
        assert readout_a.get_def_sha() != readout_b.get_def_sha()
        assert readout_a.get_rec_sha() != readout_b.get_rec_sha()

        # Different structure parameters should produce different def_sha
        readout_c = GeneratedReadout(def_seed=1, rec_seed=1, min_goals=1, max_goals=5)
        readout_d = GeneratedReadout(def_seed=1, rec_seed=1, min_goals=2, max_goals=6)
        assert readout_c.get_def_sha() != readout_d.get_def_sha()
        assert readout_c.get_rec_sha() != readout_d.get_rec_sha()

        # Different min_axes should produce different def_sha
        readout_e = GeneratedReadout(def_seed=1, rec_seed=1, min_axes=1, max_axes=3)
        readout_f = GeneratedReadout(def_seed=1, rec_seed=1, min_axes=2, max_axes=4)
        assert readout_e.get_def_sha() != readout_f.get_def_sha()
        assert readout_e.get_rec_sha() != readout_f.get_rec_sha()

        # Same parameters should produce same hashes
        readout_g = GeneratedReadout(def_seed=5, rec_seed=5, min_goals=1, max_goals=3)
        readout_h = GeneratedReadout(def_seed=5, rec_seed=5, min_goals=1, max_goals=3)
        assert readout_g.get_def_sha() == readout_h.get_def_sha()
        assert readout_g.get_rec_sha() == readout_h.get_rec_sha()

    def test_illegal_merge(self):
        """
        Tests merging incompatable coverage
        """
        readout_a = GeneratedReadout(def_seed=1, rec_seed=1)
        readout_b = GeneratedReadout(def_seed=1, rec_seed=2)
        readout_c = GeneratedReadout(def_seed=2, rec_seed=1)

        # Match
        MergeReadout(readout_a, readout_b)

        # Def mismatch
        with pytest.raises(RuntimeError):
            MergeReadout(readout_a, readout_c)

        # Rec mismatch
        readout_b.rec_sha += "_"
        with pytest.raises(RuntimeError):
            MergeReadout(readout_a, readout_b)

    @staticmethod
    def roundtrip_test(writer: Writer, reader: Reader):
        aways = {}
        # Generate and write readings
        for i in range(5):
            readout = GeneratedReadout(def_seed=i, rec_seed=i)
            ref = writer.write(readout)
            aways[ref] = readout

        # Read back and check they match
        for ref, away in aways.items():
            back = reader.read(ref)
            assert readouts_are_equal(away, back)

        # Read back a second time in reverse to check
        # not holding state unexpectedly
        for ref, away in reversed(aways.items()):
            back = reader.read(ref)
            assert readouts_are_equal(away, back)

    def test_roundtrip_sql(self):
        """
        Tests SQL read/write roundtrip
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "storage.db"
            self.roundtrip_test(
                SQLAccessor.File(path).writer(), SQLAccessor.File(path).reader()
            )

    def test_roundtrip_json(self):
        """
        Tests JSON read/write roundtrip
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "storage.json"
            self.roundtrip_test(
                JSONAccessor(path).writer(), JSONAccessor(path).reader()
            )

    def test_roundtrip_archive(self):
        """
        Tests Archive read/write roundtrip
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "storage.bktgz"
            self.roundtrip_test(
                ArchiveAccessor(path).writer(), ArchiveAccessor(path).reader()
            )

    @pytest.mark.parametrize(
        "accessor_factory,filename",
        [
            (lambda p: SQLAccessor.File(p), "storage.db"),
            (lambda p: JSONAccessor(p), "storage.json"),
            (lambda p: ArchiveAccessor(p), "storage.bktgz"),
        ],
    )
    def test_roundtrip_with_source(self, accessor_factory, filename):
        """
        Tests read/write roundtrip with source and source_key set for all storage backends
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / filename
            accessor = accessor_factory(path)
            writer = accessor.writer()
            reader = accessor.reader()

            # Test with both source and source_key
            readout = GeneratedReadout(def_seed=1, rec_seed=1)
            readout.source = "test_source"
            readout.source_key = "test_key_123"
            ref = writer.write(readout)
            back = reader.read(ref)
            assert readouts_are_equal(readout, back)
            assert back.get_source() == "test_source"
            assert back.get_source_key() == "test_key_123"

            # Test with only source
            readout2 = GeneratedReadout(def_seed=2, rec_seed=2)
            readout2.source = "test_source_only"
            readout2.source_key = ""
            ref2 = writer.write(readout2)
            back2 = reader.read(ref2)
            assert readouts_are_equal(readout2, back2)
            assert back2.get_source() == "test_source_only"
            assert back2.get_source_key() == ""

            # Test with only source_key
            readout3 = GeneratedReadout(def_seed=3, rec_seed=3)
            readout3.source = ""
            readout3.source_key = "key_only_456"
            ref3 = writer.write(readout3)
            back3 = reader.read(ref3)
            assert readouts_are_equal(readout3, back3)
            assert back3.get_source() == ""
            assert back3.get_source_key() == "key_only_456"

            # Test with both empty strings
            readout4 = GeneratedReadout(def_seed=4, rec_seed=4)
            readout4.source = ""
            readout4.source_key = ""
            ref4 = writer.write(readout4)
            back4 = reader.read(ref4)
            assert readouts_are_equal(readout4, back4)
            assert back4.get_source() == ""
            assert back4.get_source_key() == ""

    def test_mergereadout_source(self):
        """
        Tests that MergeReadout correctly sets source to Merged_... format and source_key to empty string
        """
        readout_a = GeneratedReadout(def_seed=1, rec_seed=1)
        readout_a.source = "test_a"
        readout_a.source_key = "key_a"
        readout_b = GeneratedReadout(def_seed=1, rec_seed=1)
        readout_b.source = "test_b"
        readout_b.source_key = "key_b"

        merged = MergeReadout(readout_a, readout_b)

        # Verify source is set to Merged_... format
        assert merged.get_source() != ""
        assert merged.get_source().startswith("Merged_")
        # Verify source_key is empty string
        assert merged.get_source_key() == ""

    def test_merge_files_sql(self):
        """
        Tests SQL merge_files functionality
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create multiple SQL files with compatible readouts
            path1 = Path(tmpdir) / "file1.db"
            path2 = Path(tmpdir) / "file2.db"
            path3 = Path(tmpdir) / "file3.db"

            # Write readouts with same def_sha and rec_sha (compatible for merging)
            readout1 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=1, max_hits=2)
            readout2 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=2, max_hits=3)
            readout3 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=3, max_hits=4)

            SQLAccessor.File(path1).writer().write(readout1)
            SQLAccessor.File(path2).writer().write(readout2)
            SQLAccessor.File(path3).writer().write(readout3)

            # Test variadic arguments
            merged = SQLAccessor.merge_files(path1, path2, path3)
            assert merged is not None
            assert merged.get_def_sha() == readout1.get_def_sha()
            assert merged.get_rec_sha() == readout1.get_rec_sha()

            # Test list argument
            merged2 = SQLAccessor.merge_files([path1, path2, path3])
            assert merged2 is not None
            assert merged2.get_def_sha() == readout1.get_def_sha()

            # Verify bucket hits are accumulated
            original_hits = {}
            for bh in readout1.iter_bucket_hits():
                original_hits[bh.start] = bh.hits
            for bh in readout2.iter_bucket_hits():
                original_hits[bh.start] = original_hits.get(bh.start, 0) + bh.hits
            for bh in readout3.iter_bucket_hits():
                original_hits[bh.start] = original_hits.get(bh.start, 0) + bh.hits

            merged_hits = {}
            for bh in merged.iter_bucket_hits():
                merged_hits[bh.start] = bh.hits

            assert merged_hits == original_hits

    def test_merge_files_json(self):
        """
        Tests JSON merge_files functionality
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create multiple JSON files with compatible readouts
            path1 = Path(tmpdir) / "file1.json"
            path2 = Path(tmpdir) / "file2.json"
            path3 = Path(tmpdir) / "file3.json"

            # Write readouts with same def_sha and rec_sha (compatible for merging)
            readout1 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=1, max_hits=2)
            readout2 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=2, max_hits=3)
            readout3 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=3, max_hits=4)

            JSONAccessor(path1).writer().write(readout1)
            JSONAccessor(path2).writer().write(readout2)
            JSONAccessor(path3).writer().write(readout3)

            # Test variadic arguments
            merged = JSONAccessor.merge_files(path1, path2, path3)
            assert merged is not None
            assert merged.get_def_sha() == readout1.get_def_sha()
            assert merged.get_rec_sha() == readout1.get_rec_sha()

            # Test list argument
            merged2 = JSONAccessor.merge_files([path1, path2, path3])
            assert merged2 is not None
            assert merged2.get_def_sha() == readout1.get_def_sha()

            # Verify bucket hits are accumulated
            original_hits = {}
            for bh in readout1.iter_bucket_hits():
                original_hits[bh.start] = bh.hits
            for bh in readout2.iter_bucket_hits():
                original_hits[bh.start] = original_hits.get(bh.start, 0) + bh.hits
            for bh in readout3.iter_bucket_hits():
                original_hits[bh.start] = original_hits.get(bh.start, 0) + bh.hits

            merged_hits = {}
            for bh in merged.iter_bucket_hits():
                merged_hits[bh.start] = bh.hits

            assert merged_hits == original_hits

    def test_merge_files_archive(self):
        """
        Tests Archive merge_files functionality
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create multiple archive files with compatible readouts
            path1 = Path(tmpdir) / "file1.bktgz"
            path2 = Path(tmpdir) / "file2.bktgz"
            path3 = Path(tmpdir) / "file3.bktgz"

            # Write readouts with same def_sha and rec_sha (compatible for merging)
            readout1 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=1, max_hits=2)
            readout2 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=2, max_hits=3)
            readout3 = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=3, max_hits=4)

            ArchiveAccessor(path1).writer().write(readout1)
            ArchiveAccessor(path2).writer().write(readout2)
            ArchiveAccessor(path3).writer().write(readout3)

            # Test variadic arguments
            merged = ArchiveAccessor.merge_files(path1, path2, path3)
            assert merged is not None
            assert merged.get_def_sha() == readout1.get_def_sha()
            assert merged.get_rec_sha() == readout1.get_rec_sha()

            # Test list argument
            merged2 = ArchiveAccessor.merge_files([path1, path2, path3])
            assert merged2 is not None
            assert merged2.get_def_sha() == readout1.get_def_sha()

            # Verify bucket hits are accumulated
            original_hits = {}
            for bh in readout1.iter_bucket_hits():
                original_hits[bh.start] = bh.hits
            for bh in readout2.iter_bucket_hits():
                original_hits[bh.start] = original_hits.get(bh.start, 0) + bh.hits
            for bh in readout3.iter_bucket_hits():
                original_hits[bh.start] = original_hits.get(bh.start, 0) + bh.hits

            merged_hits = {}
            for bh in merged.iter_bucket_hits():
                merged_hits[bh.start] = bh.hits

            assert merged_hits == original_hits

    def test_merge_files_single_file(self):
        """
        Tests merge_files with a single file (should still work)
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "single.json"
            readout = GeneratedReadout(def_seed=1, rec_seed=1)
            JSONAccessor(path).writer().write(readout)

            merged = JSONAccessor.merge_files(path)
            assert merged is not None
            assert merged.get_def_sha() == readout.get_def_sha()
            assert merged.get_rec_sha() == readout.get_rec_sha()

            # Single file merge should have same hits as original
            original_hits = {bh.start: bh.hits for bh in readout.iter_bucket_hits()}
            merged_hits = {bh.start: bh.hits for bh in merged.iter_bucket_hits()}
            assert merged_hits == original_hits

    def test_merge_files_multiple_records(self):
        """
        Tests merge_files with files containing multiple records
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            path1 = Path(tmpdir) / "file1.json"
            path2 = Path(tmpdir) / "file2.json"

            # Create files with multiple records (same def_sha, rec_sha for compatibility)
            accessor1 = JSONAccessor(path1)
            accessor2 = JSONAccessor(path2)

            readout1a = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=1, max_hits=1)
            readout1b = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=2, max_hits=2)
            readout2a = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=3, max_hits=3)
            readout2b = GeneratedReadout(def_seed=1, rec_seed=1, min_hits=4, max_hits=4)

            accessor1.writer().write(readout1a)
            accessor1.writer().write(readout1b)
            accessor2.writer().write(readout2a)
            accessor2.writer().write(readout2b)

            # Merge should combine all records from both files
            merged = JSONAccessor.merge_files(path1, path2)
            assert merged is not None

            # Verify all hits are accumulated
            original_hits = {}
            for readout in [readout1a, readout1b, readout2a, readout2b]:
                for bh in readout.iter_bucket_hits():
                    original_hits[bh.start] = original_hits.get(bh.start, 0) + bh.hits

            merged_hits = {bh.start: bh.hits for bh in merged.iter_bucket_hits()}
            assert merged_hits == original_hits

    def test_merge_files_empty_json(self):
        """
        Tests merge_files with empty JSON file (should skip it)
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            path1 = Path(tmpdir) / "empty.json"
            path2 = Path(tmpdir) / "file2.json"

            # Create empty JSON file (just initialize it)
            JSONAccessor(path1).writer()  # Creates empty structure

            # Write a real readout to path2
            readout = GeneratedReadout(def_seed=1, rec_seed=1)
            JSONAccessor(path2).writer().write(readout)

            # Merge should work, skipping empty file
            merged = JSONAccessor.merge_files(path1, path2)
            assert merged is not None
            assert merged.get_def_sha() == readout.get_def_sha()

    def test_merge_files_empty_sql(self):
        """
        Tests merge_files with empty SQL file (should skip it)
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            path1 = Path(tmpdir) / "empty.db"
            path2 = Path(tmpdir) / "file2.db"

            # Create empty SQL file
            SQLAccessor.File(path1)  # Creates empty DB

            # Write a real readout to path2
            readout = GeneratedReadout(def_seed=1, rec_seed=1)
            SQLAccessor.File(path2).writer().write(readout)

            # Merge should work, skipping empty file
            merged = SQLAccessor.merge_files(path1, path2)
            assert merged is not None
            assert merged.get_def_sha() == readout.get_def_sha()
