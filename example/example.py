# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Noodle-Bytes. All Rights Reserved

import logging
import random
from pathlib import Path

from git.repo import Repo

from bucket import CoverageContext
from bucket.rw import ConsoleWriter, HTMLWriter, MergeReadout, PointReader, SQLAccessor

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
    db_path: Path,
    rand: random.Random,
    log: logging.Logger,
    apply_filters_and_logging: bool = False,
    source: str | None = None,
    source_key: str | None = None,
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
            cvg = TopPets(
                log=log,
                verbosity=logging.DEBUG,
                except_on_illegal=True,
                source=source,
                source_key=source_key,
            )
            # If apply_filters_and_logging is passed in, apply filters to the coverage
            # Filtered coverage will only activate the selected coverpoints
            # but remain compatible with the full coverage for merging
            cvg.include_by_name("toys_by_name")
            cvg.exclude_by_name(["group_b", "group_2"])
        else:
            cvg = TopPets(source=source, source_key=source_key)

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

    # Create/Access a local sql database
    sql_accessor = SQLAccessor.File(db_path)

    # Write the readout into the database
    rec_ref = sql_accessor.write(readout)

    # Output to console
    if apply_filters_and_logging:
        log.info(f"\nThis is the reduced coverage with {samples} samples:")
    else:
        log.info(f"This is the coverage with {samples} samples:")
    log.info(
        f"To view this coverage in detail please run: python -m bucket write console --sql-path example_file_store.db --points --record {rec_ref}"
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

    return rec_ref


def merge(log, regr_db_path, merged_db_path, ref_1, ref_2):
    log = log.getChild("merger")

    # Access regression and merged sql databases
    r_sql_accessor = SQLAccessor.File(regr_db_path)
    m_sql_accessor = SQLAccessor.File(merged_db_path)

    # Read all test data from regression database and filter out merged entries
    all_readouts = list(r_sql_accessor.read_all())
    # Filter out merged entries (those with source starting with "Merged_")
    test_readouts = [
        readout
        for readout in all_readouts
        if not (readout.get_source() and readout.get_source().startswith("Merged_"))
    ]

    if not test_readouts:
        log.warning("No test readouts found to merge")
        return

    # Merge all test data together (accumulated merge)
    merged_readout = MergeReadout(*test_readouts)

    # Write merged coverage into the merged database
    rec_ref_merged = m_sql_accessor.write(merged_readout)

    log.info(
        f"This is the accumulated merged coverage from {len(test_readouts)} test(s)."
    )
    log.info(
        f"To view this coverage in detail please run: python -m bucket write console --sql-path example_file_store.db --points --record {rec_ref_merged}"
    )
    ConsoleWriter().write(merged_readout)
    log.info("-------------------------------------------------------")

    # Read all back from sql - note as the db is not removed this will
    # accumulate each time this example is run. This will also include
    # merged data as well as the individual runs. It is meant as an example
    # of how to use the command
    all_readouts = list(r_sql_accessor.read_all())
    merged_readout_all = MergeReadout(*all_readouts)
    log.info("This is the coverage from all the regression data so far:")
    log.info(
        f"(To reset please delete the files '{regr_db_path}' and '{merged_db_path}')"
    )
    ConsoleWriter().write(merged_readout_all)
    log.info("-------------------------------------------------------")

    # Generating web viewer
    # To generate the HTML report run:
    # python -m bucket write html --sql-path ./example_file_store.db --output index.html
    # Pass all individual readouts plus merged readouts so the viewer can show each test separately
    log.info("Generating the web viewer for all coverage")
    try:
        # Include readouts from both regression and merged databases
        merged_readouts = list(m_sql_accessor.read_all())
        all_readouts_for_viewer = all_readouts + merged_readouts
        HTMLWriter().write(all_readouts_for_viewer)
        log.info("To see the coverage in your browser open: index.html")
    except Exception:
        log.error("Web viewer failed")


def run(reg_db_path: Path = "example_regr_file_store.db"):
    logging.basicConfig(level=logging.DEBUG)
    log = logging.getLogger("tb")
    log.setLevel(logging.DEBUG)
    rand = random.Random()

    merged_db_path = "example_merged_file_store.db"

    # Run "testbench" once with all coverage enabled
    source_key_1 = str(rand.randint(1, 1000000))
    ref_1 = run_testbench(
        reg_db_path, rand, log, source="test_full_coverage", source_key=source_key_1
    )

    # Run "testbench" a second time with some coverage filtered
    source_key_2 = str(rand.randint(1, 1000000))
    ref_2 = run_testbench(
        reg_db_path,
        rand,
        log,
        apply_filters_and_logging=True,
        source="test_filtered_coverage",
        source_key=source_key_2,
    )

    # Merge the two runs
    merge(log, reg_db_path, merged_db_path, ref_1, ref_2)


if __name__ == "__main__":
    run()
