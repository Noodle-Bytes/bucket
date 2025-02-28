# SPDX-License-Identifier: MIT
# Copyright (c) 2023-2025 Vypercore. All Rights Reserved

import logging
import random
from pathlib import Path

from git.repo import Repo

from bucket import CoverageContext
from bucket.rw import ConsoleWriter, HTMLWriter, MergeReading, PointReader, SQLAccessor

from .common import MadeUpStuff
from .top import TopPets

# This file sets up and runs the example coverage. While it doesn't reflect the expected
# setup within a testbench, it will demonstrate several useful features.


def pretend_monitor(rand):
    """
    Nonsense function to generate a trace object for the example
    In a real testbench this would come from monitors, etc
    For this example, create random dog and cat data and put in a dictionary
    In practise this would normally be a class, which can be populated with as
    many types of nested data as required.
    """

    trace = {}

    trace["type"] = rand.choice(["Cat", "Dog"])
    trace["Breed"] = rand.randint(0, 4)
    trace["Age"] = rand.randint(0, 15)
    trace["Name"] = rand.choice(MadeUpStuff.pet_names)

    if trace["type"] == "Dog":
        trace["Chew_toy"] = rand.choices(["Slipper", "Ball", "Stick", "Ring"], k=2)
        trace["Weight"] = rand.randint(5, 50)
        trace["Leg"] = rand.choice([1, 2, 4, 8])

    else:
        trace["Evil_thoughts"] = rand.randint(5, 50)
        trace["Superiority"] = rand.choice(["low", "medium", "high"])
        trace["Play_toy"] = rand.choice(
            ["Toy_mouse", "Scratching Post", "Laser", "Box"]
        )
    return trace


def run_testbench(
    db_path: Path,
    rand: random.Random,
    logger: logging.Logger,
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
    context_hash = Repo().head.object.hexsha

    # Create a reader
    point_reader = PointReader(context_hash)

    # Read the coverage
    reading = point_reader.read(cvg)

    # Create/Access a local sql database
    sql_accessor = SQLAccessor.File(db_path)

    # Write the reading into the database
    rec_ref = sql_accessor.write(reading)

    # Output to console
    if apply_filters_and_logging:
        log.info(f"\nThis is the reduced coverage with {samples} samples:")
    else:
        log.info(f"This is the coverage with {samples} samples:")
    log.info(
        f"To view this coverage in detail please run: python -m bucket write console --sql-path example_file_store.db --points --record {rec_ref}"
    )
    ConsoleWriter().write(reading)
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

    # Read back from sql
    sql_reading_1 = r_sql_accessor.read(ref_1)
    sql_reading_2 = r_sql_accessor.read(ref_2)

    # Merge together
    merged_reading = MergeReading(sql_reading_1, sql_reading_2)

    # Write merged coverage into the merged database
    rec_ref_merged = m_sql_accessor.write(merged_reading)

    log.info("This is the merged coverage from the above 2 regressions.")
    log.info(
        f"To view this coverage in detail please run: python -m bucket write console --sql-path example_file_store.db --points --record {rec_ref_merged}"
    )
    ConsoleWriter().write(merged_reading)
    log.info("-------------------------------------------------------")

    # Read all back from sql - note as the db is not removed this will
    # accumulate each time this example is run. This will also include
    # merged data as well as the individual runs. It is meant as an example
    # of how to use the command
    merged_reading_all = MergeReading(*r_sql_accessor.read_all())
    log.info("This is the coverage from all the regression data so far:")
    log.info(
        f"(To reset please delete the files '{regr_db_path}' and '{merged_db_path}')"
    )
    ConsoleWriter().write(merged_reading_all)
    log.info("-------------------------------------------------------")

    # Generating web viewer
    # To generate the HTML report run:
    # python -m bucket write html --sql-path ./example_file_store.db --output index.html
    log.info("Generating the web viewer for all coverage")
    try:
        HTMLWriter().write(merged_reading_all)
        log.info("To see the coverage in your browser open: index.html")
    except Exception:
        log.error("Web viewer failed")


if __name__ == "__main__":
    logging.basicConfig(level=logging.DEBUG)
    log = logging.getLogger("tb")
    log.setLevel(logging.DEBUG)

    rand = random.Random()
    reg_db_path = "example_regr_file_store.db"
    merged_db_path = "example_merged_file_store.db"

    ref_1 = run_testbench(reg_db_path, rand, log)

    ref_2 = run_testbench(reg_db_path, rand, log, apply_filters_and_logging=True)

    merge(log, reg_db_path, merged_db_path, ref_1, ref_2)
