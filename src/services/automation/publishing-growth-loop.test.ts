import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalGrowthActionKey,
  canonicalGrowthActionKeyFromWorkItem,
  runPublishingGrowthLoop,
} from "./publishing-growth-loop";

test("growth action keys are stable across dates and legacy source ids", () => {
  const canonical = canonicalGrowthActionKey("book-1", "reviews");
  assert.equal(canonical, "growthloop:book-1:reviews");
  assert.equal(
    canonicalGrowthActionKeyFromWorkItem({
      source_id: "growthloop:2026-08-27:book-1:reviews",
      metadata: { loop: "publishing_growth_v1", book_id: "book-1", action_type: "reviews" },
    }),
    canonical,
  );
});

test("growth loop does not create a new task when a legacy open task exists", async () => {
  const inserted: unknown[] = [];
  const books = [{
    id: "book-1",
    title: "Existing Book",
    subtitle: "A sufficiently descriptive subtitle for the test book",
    reviews_count: 0,
    orders: 0,
    ad_spend: 0,
    keywords: ["one", "two", "three", "four", "five"],
    main_category: "Business",
    series_name: "Series One",
  }];
  const workItems = [{
    source_id: "growthloop:2026-08-27:book-1:reviews",
    status: "TO_DO",
    metadata: { loop: "publishing_growth_v1", book_id: "book-1", action_type: "reviews" },
  }];

  const client = {
    from(table: string) {
      if (table === "publishing_books") {
        return {
          select() { return this; },
          order() { return this; },
          async limit() { return { data: books, error: null }; },
        };
      }
      if (table === "work_items") {
        return {
          select() { return this; },
          in() { return this; },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({ data: workItems, error: null }).then(resolve);
          },
          async insert(rows: unknown[]) {
            inserted.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const result = await runPublishingGrowthLoop(client as never, { hardMode: false });
  assert.equal(result.actions_skipped_existing, 1);
  assert.equal(
    inserted.filter((row) => (row as { metadata?: { action_type?: string } }).metadata?.action_type === "reviews").length,
    0,
  );
});

test("growth loop keeps only the highest scoring action per book and action type", async () => {
  const inserted: Array<Record<string, unknown>> = [];
  const books = [{
    id: "book-2",
    title: "Low Rating Book",
    subtitle: null,
    reviews_count: 0,
    average_rating: 3.2,
    orders: 0,
    ad_spend: 0,
    keywords: [],
    main_category: null,
    series_name: "Series Two",
  }];

  const client = {
    from(table: string) {
      if (table === "publishing_books") {
        return {
          select() { return this; },
          order() { return this; },
          async limit() { return { data: books, error: null }; },
        };
      }
      if (table === "work_items") {
        return {
          select() { return this; },
          in() { return this; },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
          async insert(rows: Array<Record<string, unknown>>) {
            inserted.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const result = await runPublishingGrowthLoop(client as never, { hardMode: false });
  const metadataRows = inserted.filter((row) => (row.metadata as { action_type?: string })?.action_type === "metadata");
  assert.equal(metadataRows.length, 1);
  assert.equal(metadataRows[0].source_id, "growthloop:book-2:metadata");
  assert.equal(result.duplicate_actions_suppressed, 1);
});
