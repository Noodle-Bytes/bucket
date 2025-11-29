# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2026 Noodle-Bytes. All Rights Reserved

import logging
import random
from pathlib import Path

from git.repo import Repo

from bucket import CoverageContext
from bucket.rw import (
    ArchiveAccessor,
    ConsoleWriter,
    HTMLWriter,
    MergeReadout,
    PointReader,
)

from .common import CatInfo, DogInfo, MadeUpStuff, PetInfo
from .top import TopPets

# This file sets up and runs the example coverage. While it doesn't reflect the expected
# setup within a testbench, it will demonstrate several useful features.


def pretend_monitor(rand):
    """
    Nonsense function to generate a trace object for the example
    In a real testbench this would come from monitors, etc
    For this example, create random dog and cat data and put in a dictionary
    In practice this would normally be a class, which can be populated with as
    many types of nested data as required.
    """

    trace = PetInfo()
    trace.pet_type = rand.choice(["Cat", "Dog"])
    trace.breed = rand.randint(0, 4)
    trace.age = rand.randint(0, 18)
    trace.name = rand.choice(MadeUpStuff.pet_names)

    if trace.pet_type == "Dog":
        info = DogInfo()
        info.chew_toy = rand.choices(MadeUpStuff.dog_chew_toys, k=2)
        info.weight = rand.randint(5, 50)
        info.leg = rand.choice([1, 2, 4, 8])
        trace.info = info

    else:
        info = CatInfo()
        info.evil_thoughts_per_hour = rand.randint(5, 50)
        info.superiority_factor = rand.choice(MadeUpStuff.cat_superiority)
        info.play_toy = rand.choice(MadeUpStuff.cat_play_toy)
        trace.info = info
    return trace


def run_testbench(
    output_path: Path,
    rand: random.Random,
    log: logging.Logger,
    apply_filters_and_logging: bool = False,
):
    samples = 250

    # Get some common pet info for coverpoints to use. This would usually come from an ISA
    # or defined constants. In this case,  it is breeds and names of pets for coverage to use.
    log.info("Get information used to build coverpoints")
    pet_info = MadeUpStuff()

    # Instance the coverage. We'll be doing this twice in this example, but this is to demonstrate
    # merging as well as other features.
    log.info("Build coverpoints...")
    with CoverageContext(pet_info=pet_info):
        if apply_filters_and_logging:
            # except_on_illegal is set here as an example, but the filtered coverage
            # is not expected to hit any illegal buckets
            cvg = TopPets(log=log, verbosity=logging.DEBUG, except_on_illegal=True)
            # If apply_filters_and_logging is passed in, apply filters to the coverage
            # Filtered coverage will only activate the selected coverpoints
            # but remain compatible with the full coverage for merging
            cvg.include_by_name("toys_by_name")
            cvg.exclude_by_name(["group_b", "group_2"])
        else:
            cvg = TopPets()

    log.info("Run the 'test'...")
    for _ in range(samples):
        cvg.sample(pretend_monitor(rand))

    # Create a context specific hash
    # This is stored alongside recorded coverage and is used to determine if
    # coverage is valid to merge.
    # Note repo path set explicitely here as otherwise it will use the cwd.
    context_hash = Repo(Path(__file__).parent.parent).head.object.hexsha

    # Create a reader
    point_reader = PointReader(context_hash)

    # Read the coverage
    readout = point_reader.read(cvg)

    # Export to bucket archive format (.bktgz)
    # Create a unique filename based on whether filters are applied
    suffix = "_filtered" if apply_filters_and_logging else ""
    archive_path = output_path.parent / f"{output_path.stem}{suffix}.bktgz"
    archive_writer = ArchiveAccessor(archive_path).writer()
    archive_writer.write(readout)
    log.info(f"Coverage exported to archive: {archive_path}")

    # Output to console
    if apply_filters_and_logging:
        log.info(f"\nThis is the reduced coverage with {samples} samples:")
    else:
        log.info(f"This is the coverage with {samples} samples:")
    log.info(
        f"To view this coverage, open the archive file in the Bucket viewer: {archive_path}"
    )
    ConsoleWriter().write(readout)
    log.info("-------------------------------------------------------")

    if apply_filters_and_logging:
        # print_tree() is a useful function to see the hierarchy of your coverage
        # You can call it from the top level covergroup, or from another covergroup
        # within your coverage tree.
        log.info("Print tree for whole coverage using 'cvg.print_tree():")
        cvg.print_tree()

        log.info("-------------------------------------------------------")
        log.info("Print tree for partial coverage using 'cvg.dogs.print_tree():")
        cvg.dogs.print_tree()
        log.info("-------------------------------------------------------")

    return archive_path


def merge(log, archive_path_1, archive_path_2, merged_archive_path):
    log = log.getChild("merger")

    # Read from archive files
    archive_reader_1 = ArchiveAccessor(archive_path_1).reader()
    archive_reader_2 = ArchiveAccessor(archive_path_2).reader()

    # Each archive contains a single record, so get the first (and only) readout
    readout_1 = next(archive_reader_1.read_all())
    readout_2 = next(archive_reader_2.read_all())

    # Merge together
    merged_readout = MergeReadout(readout_1, readout_2)

    # Export merged coverage to bucket archive format
    archive_writer = ArchiveAccessor(merged_archive_path).writer()
    archive_writer.write(merged_readout)
    log.info(f"Merged coverage exported to archive: {merged_archive_path}")

    log.info("This is the merged coverage from the above 2 regressions.")
    log.info(
        f"To view this coverage, open the archive file in the Bucket viewer: {merged_archive_path}"
    )
    ConsoleWriter().write(merged_readout)
    log.info("-------------------------------------------------------")

    # Generating web viewer
    log.info("Generating a local web viewer for viewing coverage")
    try:
        HTMLWriter().write(merged_readout)
        log.info("To see the coverage in your browser open: index.html")
    except Exception:
        log.error("Web viewer failed")


def run(output_dir: Path = Path(".")):
    logging.basicConfig(level=logging.DEBUG)
    log = logging.getLogger("tb")
    log.setLevel(logging.DEBUG)
    rand = random.Random()

    # Run "testbench" once with all coverage enabled
    archive_path_1 = run_testbench(output_dir / "example_regr_file_store", rand, log)

    # Run "testbench" a second time with some coverage filtered
    archive_path_2 = run_testbench(
        output_dir / "example_regr_file_store",
        rand,
        log,
        apply_filters_and_logging=True,
    )

    # Merge the two runs
    merged_archive_path = output_dir / "example_merged_file_store.bktgz"
    merge(log, archive_path_1, archive_path_2, merged_archive_path)


if __name__ == "__main__":
    run()
