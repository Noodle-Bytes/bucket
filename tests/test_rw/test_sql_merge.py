# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import tempfile
from pathlib import Path

import pytest

from bucket.rw import SQLAccessor
from bucket.rw.sql import merge_sql_direct

from ..utils import GeneratedReadout


class TestSQLDirectMerge:
    """Tests for direct SQL database merging without going through Python Readout objects"""

    def test_merge_two_databases(self):
        """Test merging two SQLite databases with identical coverage definitions"""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            # Create two identical readouts with different hit data
            readout1 = GeneratedReadout(
                def_seed=1,
                rec_seed=1,
                min_goals=2,
                max_goals=2,
                min_axes=2,
                max_axes=2,
                min_axis_values=3,
                max_axis_values=3,
                min_target=10,
                max_target=10,
                min_hits=5,
                max_hits=5,
                min_points=3,
                max_points=3,
                group_initial_chance=0,
            )

            readout2 = GeneratedReadout(
                def_seed=1,  # Same definition
                rec_seed=2,  # Different hits
                min_goals=2,
                max_generatingoals=2,
                min_axes=2,
                max_axes=2,
                min_axis_values=3,
                max_axis_values=3,
                min_target=10,
                max_target=10,
                min_hits=7,
                max_hits=7,
                min_points=3,
                max_points=3,
                group_initial_chance=0,
            )

            # Write to separate databases
            db1_path = tmppath / "test1.db"
            db2_path = tmppath / "test2.db"
            merged_path = tmppath / "merged.db"

            writer1 = SQLAccessor.File(db1_path).writer()
            writer2 = SQLAccessor.File(db2_path).writer()

            writer1.write(readout1)
            writer2.write(readout2)

            # Perform direct merge
            run_id = merge_sql_direct(
                merged_path,
                db1_path,
                db2_path,
                source="TestMerge",
                source_key="test_key",
            )

            assert run_id == 1, "Merged run should have ID 1"

            # Read back the merged database
            reader = SQLAccessor.File(merged_path).reader()
            merged_readout = reader.read(run_id)

            # Verify metadata
            assert merged_readout.get_source() == "TestMerge"
            assert merged_readout.get_source_key() == "test_key"
            assert merged_readout.get_def_sha() == readout1.get_def_sha()

            # Verify bucket hits were summed correctly
            bucket_hits1 = {bh.start: bh.hits for bh in readout1.iter_bucket_hits()}
            bucket_hits2 = {bh.start: bh.hits for bh in readout2.iter_bucket_hits()}
            merged_bucket_hits = {
                bh.start: bh.hits for bh in merged_readout.iter_bucket_hits()
            }

            for start in bucket_hits1:
                expected_hits = bucket_hits1[start] + bucket_hits2[start]
                assert merged_bucket_hits[start] == expected_hits, (
                    f"Bucket {start} should have {expected_hits} hits, "
                    f"got {merged_bucket_hits[start]}"
                )

    def test_merge_three_databases(self):
        """Test merging three databases"""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            # Create three readouts with same def, different hits
            readouts = []
            db_paths = []

            for i in range(3):
                readout = GeneratedReadout(
                    def_seed=42,
                    rec_seed=i + 1,
                    min_goals=2,
                    max_goals=2,
                    min_axes=2,
                    max_axes=2,
                    min_axis_values=2,
                    max_axis_values=2,
                    min_target=5,
                    max_target=5,
                    min_hits=i + 1,
                    max_hits=i + 1,
                    min_points=2,
                    max_points=2,
                    group_initial_chance=0,
                )
                readouts.append(readout)

                db_path = tmppath / f"test{i}.db"
                db_paths.append(db_path)
                writer = SQLAccessor.File(db_path).writer()
                writer.write(readout)

            # Merge all three
            merged_path = tmppath / "merged.db"
            run_id = merge_sql_direct(merged_path, *db_paths)

            # Read back and verify
            reader = SQLAccessor.File(merged_path).reader()
            merged_readout = reader.read(run_id)

            # Sum bucket hits from all three
            all_bucket_hits = {}
            for readout in readouts:
                for bh in readout.iter_bucket_hits():
                    if bh.start not in all_bucket_hits:
                        all_bucket_hits[bh.start] = 0
                    all_bucket_hits[bh.start] += bh.hits

            # Compare with merged result
            for bh in merged_readout.iter_bucket_hits():
                expected = all_bucket_hits[bh.start]
                assert (
                    bh.hits == expected
                ), f"Bucket {bh.start} should have {expected} hits, got {bh.hits}"

    def test_merge_incompatible_definition_shas(self):
        """Test that merging databases with different definition SHAs raises an error"""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            # Create two readouts with DIFFERENT definitions
            readout1 = GeneratedReadout(
                def_seed=1,
                rec_seed=1,
                min_goals=2,
                max_goals=2,
                min_points=2,
                max_points=2,
            )

            readout2 = GeneratedReadout(
                def_seed=99,  # Different seed = different definition
                rec_seed=2,
                min_goals=3,  # Different structure
                max_goals=3,
                min_points=3,
                max_points=3,
            )

            db1_path = tmppath / "test1.db"
            db2_path = tmppath / "test2.db"
            merged_path = tmppath / "merged.db"

            writer1 = SQLAccessor.File(db1_path).writer()
            writer2 = SQLAccessor.File(db2_path).writer()

            writer1.write(readout1)
            writer2.write(readout2)

            # Should raise RuntimeError due to SHA mismatch
            with pytest.raises(RuntimeError, match="different definition SHAs"):
                merge_sql_direct(merged_path, db1_path, db2_path)

    def test_merge_empty_input(self):
        """Test that merging with no input paths raises an error"""
        with tempfile.TemporaryDirectory() as tmpdir:
            merged_path = Path(tmpdir) / "merged.db"

            with pytest.raises(ValueError, match="At least one input"):
                merge_sql_direct(merged_path)

    def test_merge_nonexistent_database(self):
        """Test that merging with nonexistent database raises an error"""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            nonexistent = tmppath / "doesnotexist.db"
            merged_path = tmppath / "merged.db"

            with pytest.raises(ValueError, match="does not exist"):
                merge_sql_direct(merged_path, nonexistent)

    def test_merge_default_source_timestamp(self):
        """Test that default source includes timestamp"""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            readout = GeneratedReadout(
                def_seed=1,
                rec_seed=1,
                min_points=2,
                max_points=2,
            )

            db1_path = tmppath / "test1.db"
            merged_path = tmppath / "merged.db"

            writer = SQLAccessor.File(db1_path).writer()
            writer.write(readout)

            # Merge without specifying source
            run_id = merge_sql_direct(merged_path, db1_path)

            reader = SQLAccessor.File(merged_path).reader()
            merged_readout = reader.read(run_id)

            # Should have "Merged_" prefix with timestamp
            assert merged_readout.get_source().startswith("Merged_")
            assert merged_readout.get_source_key() == ""

    def test_merge_preserves_definition_data(self):
        """Test that all definition data is correctly preserved after merge"""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            readout1 = GeneratedReadout(
                def_seed=1,
                rec_seed=1,
                min_goals=3,
                max_goals=3,
                min_axes=3,
                max_axes=3,
                min_axis_values=4,
                max_axis_values=4,
                min_points=5,
                max_points=5,
            )

            readout2 = GeneratedReadout(
                def_seed=1,  # Same definition
                rec_seed=2,
                min_goals=3,
                max_goals=3,
                min_axes=3,
                max_axes=3,
                min_axis_values=4,
                max_axis_values=4,
                min_points=5,
                max_points=5,
            )

            db1_path = tmppath / "test1.db"
            db2_path = tmppath / "test2.db"
            merged_path = tmppath / "merged.db"

            writer1 = SQLAccessor.File(db1_path).writer()
            writer2 = SQLAccessor.File(db2_path).writer()

            writer1.write(readout1)
            writer2.write(readout2)

            run_id = merge_sql_direct(merged_path, db1_path, db2_path)

            reader = SQLAccessor.File(merged_path).reader()
            merged_readout = reader.read(run_id)

            # Verify all definition elements match original
            points1 = list(readout1.iter_points())
            points_merged = list(merged_readout.iter_points())
            assert len(points1) == len(points_merged)
            for p1, pm in zip(points1, points_merged):
                assert p1 == pm

            axes1 = list(readout1.iter_axes())
            axes_merged = list(merged_readout.iter_axes())
            assert len(axes1) == len(axes_merged)
            for a1, am in zip(axes1, axes_merged):
                assert a1 == am

            goals1 = list(readout1.iter_goals())
            goals_merged = list(merged_readout.iter_goals())
            assert len(goals1) == len(goals_merged)
            for g1, gm in zip(goals1, goals_merged):
                assert g1 == gm

    def test_merge_point_hits_recalculated(self):
        """Test that point hits are correctly recalculated from merged bucket hits"""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)

            # Create simple readouts with known hit patterns
            readout1 = GeneratedReadout(
                def_seed=1,
                rec_seed=1,
                min_goals=1,
                max_goals=1,
                min_axes=2,
                max_axes=2,
                min_axis_values=2,
                max_axis_values=2,
                min_target=10,
                max_target=10,
                min_hits=5,
                max_hits=5,
                min_points=1,
                max_points=1,
                group_initial_chance=0,
            )

            readout2 = GeneratedReadout(
                def_seed=1,
                rec_seed=2,
                min_goals=1,
                max_goals=1,
                min_axes=2,
                max_axes=2,
                min_axis_values=2,
                max_axis_values=2,
                min_target=10,
                max_target=10,
                min_hits=3,
                max_hits=3,
                min_points=1,
                max_points=1,
                group_initial_chance=0,
            )

            db1_path = tmppath / "test1.db"
            db2_path = tmppath / "test2.db"
            merged_path = tmppath / "merged.db"

            writer1 = SQLAccessor.File(db1_path).writer()
            writer2 = SQLAccessor.File(db2_path).writer()

            writer1.write(readout1)
            writer2.write(readout2)

            run_id = merge_sql_direct(merged_path, db1_path, db2_path)

            reader = SQLAccessor.File(merged_path).reader()
            merged_readout = reader.read(run_id)

            # Get merged point hits
            point_hits = list(merged_readout.iter_point_hits())

            # Verify that total hits are reasonable (should be sum of bucket hits, capped by targets)
            for ph in point_hits:
                # Hits should be non-negative
                assert ph.hits >= 0
                # Hit buckets should be between 0 and total buckets
                assert ph.hit_buckets >= 0
                # Full buckets should not exceed hit buckets
                assert ph.full_buckets <= ph.hit_buckets
