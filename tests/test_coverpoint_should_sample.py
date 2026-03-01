# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

"""
Tests for Coverpoint.should_sample(): default behaviour and overrides.
"""

from bucket import Coverpoint, Covertop


class CoverpointWithValueAxis(Coverpoint):
    """Coverpoint with single axis 'value' [0, 1, 2] for hit counting."""

    def setup(self, ctx):
        self.add_axis("value", values=[0, 1, 2], description="Test axis")

    def sample(self, trace):
        if "value" in trace:
            self.bucket.clear()
            self.bucket.set_axes(value=trace["value"])
            self.bucket.hit()


class CoverpointNeverSample(Coverpoint):
    """Override should_sample to never sample."""

    def setup(self, ctx):
        self.add_axis("value", values=[0, 1], description="Test axis")

    def should_sample(self, trace):
        return False

    def sample(self, trace):
        self.bucket.clear()
        self.bucket.set_axes(value=trace["value"])
        self.bucket.hit()


class CoverpointSampleWhenFlagged(Coverpoint):
    """Override should_sample to only sample when trace has sample_me=True."""

    def setup(self, ctx):
        self.add_axis("value", values=[0, 1, 2], description="Test axis")

    def should_sample(self, trace):
        return trace.get("sample_me", False)

    def sample(self, trace):
        self.bucket.clear()
        self.bucket.set_axes(value=trace["value"])
        self.bucket.hit()


class TopWithDefaultCoverpoint(Covertop):
    """Covertop with a coverpoint that does not override should_sample."""

    def setup(self, ctx):
        self.add_coverpoint(CoverpointWithValueAxis(), name="DefaultCP")


class TopWithNeverSample(Covertop):
    """Covertop with a coverpoint that overrides should_sample to return False."""

    def setup(self, ctx):
        self.add_coverpoint(CoverpointNeverSample(), name="NeverCP")


class TopWithConditionalSample(Covertop):
    """Covertop with a coverpoint that samples only when trace['sample_me'] is True."""

    def setup(self, ctx):
        self.add_coverpoint(CoverpointSampleWhenFlagged(), name="ConditionalCP")


class TestCoverpointShouldSample:
    """Test Coverpoint.should_sample default and override behaviour."""

    def test_default_should_sample_allows_sampling(self):
        """When should_sample is not overridden it returns True; sampling records hits."""
        cvg = TopWithDefaultCoverpoint()
        cp = cvg.DefaultCP
        cvg.sample({"value": 0})
        cvg.sample({"value": 1})
        cvg.sample({"value": 2})
        total_hits = sum(cp._cvg_hits.values())
        assert total_hits == 3
        assert cp._cvg_hits[("0",)] == 1
        assert cp._cvg_hits[("1",)] == 1
        assert cp._cvg_hits[("2",)] == 1

    def test_override_should_sample_return_false_skips_sampling(self):
        """When should_sample returns False, sample() is not called and no hits are recorded."""
        cvg = TopWithNeverSample()
        cp = cvg.NeverCP
        cvg.sample({"value": 0})
        cvg.sample({"value": 1})
        total_hits = sum(cp._cvg_hits.values())
        assert total_hits == 0

    def test_override_should_sample_conditional_only_sampled_traces_record_hits(self):
        """When should_sample is overridden conditionally, only traces that pass are sampled."""
        cvg = TopWithConditionalSample()
        cp = cvg.ConditionalCP
        cvg.sample({"value": 0, "sample_me": True})
        cvg.sample({"value": 1, "sample_me": False})
        cvg.sample({"value": 2, "sample_me": True})
        total_hits = sum(cp._cvg_hits.values())
        assert total_hits == 2
        assert cp._cvg_hits[("0",)] == 1
        assert cp._cvg_hits[("1",)] == 0
        assert cp._cvg_hits[("2",)] == 1

    def test_should_sample_receives_trace(self):
        """should_sample is called with the same trace object passed to the coverage tree."""
        received_traces = []

        class CaptureTraceCoverpoint(Coverpoint):
            def setup(self, ctx):
                self.add_axis("x", values=[0, 1], description="X")

            def should_sample(self, trace):
                received_traces.append(trace)
                return True

            def sample(self, trace):
                self.bucket.clear()
                self.bucket.set_axes(x=trace["x"])
                self.bucket.hit()

        class Top(Covertop):
            def setup(self, ctx):
                self.add_coverpoint(CaptureTraceCoverpoint(), name="Cap")

        cvg = Top()
        trace = {"x": 0}
        cvg.sample(trace)
        assert len(received_traces) == 1
        assert received_traces[0] is trace
