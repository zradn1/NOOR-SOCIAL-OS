import { buildDatabase, dropDatabase } from "../../tooling/local-db/apply";

export const TEMPLATE_DB = "noor_test_template";

/** Builds the migrated template database once per test run. */
export async function setup() {
  await buildDatabase(TEMPLATE_DB);
}

export async function teardown() {
  await dropDatabase(TEMPLATE_DB);
}
