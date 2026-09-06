#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL;
const expectedDbUser = process.env.SCHEMA_CONTRACT_EXPECTED_DB_USER;

if (!connectionString) {
  console.error("Missing protected database URL for Learning-origin guard contract.");
  process.exit(2);
}

const failures = [];
const client = new Client({
  connectionString,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  application_name: "book-os-learning-origin-guard-contract",
});

await client.connect();
try {
  await client.query("set default_transaction_read_only = on");
  await client.query("set statement_timeout = '30s'");
  await client.query("set lock_timeout = '5s'");

  if (expectedDbUser) {
    const { rows } = await client.query("select current_user");
    if (rows[0]?.current_user !== expectedDbUser) failures.push("connected with an unexpected database user");
  }

  const { rows: triggerRows } = await client.query(`
    select
      t.tgenabled,
      p.proname,
      pg_get_triggerdef(t.oid) as trigger_def
    from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal
      and n.nspname='public'
      and c.relname='publishing_book_projects'
      and t.tgname='publishing_guard_learning_origin_production_trg'
  `);
  const trigger = triggerRows[0];
  if (!trigger) failures.push("Learning-origin production trigger is missing");
  else {
    if (!['O','A'].includes(String(trigger.tgenabled))) failures.push("Learning-origin production trigger is disabled");
    if (trigger.proname !== 'publishing_guard_learning_origin_production') failures.push("Learning-origin trigger points to an unexpected function");
    if (!String(trigger.trigger_def || '').includes('BEFORE UPDATE ON public.publishing_book_projects')) failures.push("Learning-origin trigger lost BEFORE UPDATE scope");
  }

  const { rows: functionRows } = await client.query(`
    select
      p.prosecdef as security_definer,
      pg_get_functiondef(p.oid) as function_def
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='publishing_guard_learning_origin_production'
      and pg_get_function_identity_arguments(p.oid)=''
  `);
  const fn = functionRows[0];
  if (!fn) failures.push("Learning-origin production guard function is missing");
  else {
    if (fn.security_definer) failures.push("Learning-origin guard unexpectedly became SECURITY DEFINER");
    const def = String(fn.function_def || '');
    for (const token of [
      'approved_learning_proposal',
      'learning_production_start_required',
      'learning_canon_required',
      'learning_author_step_required',
    ]) {
      if (!def.includes(token)) failures.push(`Learning-origin guard lost contract token: ${token}`);
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

console.log("Book OS Learning-origin guard schema contract");
console.log(`Failures: ${failures.length}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exit(1);
