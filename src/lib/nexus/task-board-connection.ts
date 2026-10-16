/**
 * Nexus board: fail-closed PostgreSQL transport and least-privilege assertion.
 * This file does not supply credentials or enable the board. All database
 * access remains behind existing server authentication + feature gates.
 *
 * SECURITY: node-postgres can overwrite an explicit verified SSL object when
 * SSL-related query parameters appear in a connection URL. Reject parameters.
 */
import type { NexusTaskBoardQueryClient } from "./task-board-read";

export interface NexusBoardReaderClient extends NexusTaskBoardQueryClient {
  connect(): Promise<void>;
  end(): Promise<void>;
}

export function parseNexusBoardDatabaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXUS_BOARD_DATABASE_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname || !url.username || !url.password ||
      !url.pathname || url.pathname === "/" ||
      url.hash || Array.from(url.searchParams.keys()).length !== 0) {
    throw new Error("NEXUS_BOARD_DATABASE_URL_INVALID");
  }
  return url;
}

const READER_PROOF_SQL = `select
  pg_catalog.pg_has_role(current_user,'nexus_task_board_reader','USAGE') as restricted_role,
  exists(select 1 from pg_catalog.pg_roles
         where rolname=current_user
         and not (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole)) as ordinary_role,
  pg_catalog.has_table_privilege(current_user,'core.nexus_task_board_entries','SELECT') as can_read_board,
  pg_catalog.has_table_privilege(current_user,'core.nexus_task_board_allowed_readers','SELECT') as can_read_grants,
  pg_catalog.has_schema_privilege(current_user,'core','CREATE') as can_create_in_core,
  pg_catalog.has_table_privilege(current_user,'core.nexus_execution_tasks','SELECT,INSERT,UPDATE,DELETE') as task_table_access,
  pg_catalog.has_table_privilege(current_user,'core.nexus_execution_approvals','SELECT,INSERT,UPDATE,DELETE') as approval_table_access,
  pg_catalog.has_table_privilege(current_user,'core.nexus_execution_authorizations','SELECT,INSERT,UPDATE,DELETE') as grant_table_access,
  pg_catalog.has_table_privilege(current_user,'core.brand_workspace_memberships','SELECT,INSERT,UPDATE,DELETE') as membership_table_access,
  pg_catalog.has_table_privilege(current_user,'core.nexus_execution_claims','SELECT,INSERT,UPDATE,DELETE') as claim_table_access,
  pg_catalog.has_function_privilege(current_user,
    'core.claim_nexus_execution_task(uuid,integer,uuid,uuid,text,text,text)','EXECUTE') as can_claim,
  pg_catalog.has_function_privilege(current_user,
    'core.create_nexus_review_task(uuid,uuid,text,text,text[],text)','EXECUTE') as can_propose,
  pg_catalog.has_function_privilege(current_user,
    'core.decide_nexus_review_task(uuid,uuid,integer,text,text)','EXECUTE') as can_review`;

export async function assertNexusBoardReadOnlyRole(client: NexusTaskBoardQueryClient): Promise<void> {
  const result = await client.query(READER_PROOF_SQL, []);
  if (result.rows.length !== 1) throw new Error("NEXUS_BOARD_READER_ROLE_DENIED");
  const row = result.rows[0];
  const required = ["restricted_role","ordinary_role","can_read_board","can_read_grants"];
  const denied = ["can_create_in_core","task_table_access","approval_table_access",
    "grant_table_access","membership_table_access","claim_table_access",
    "can_claim","can_propose","can_review"];
  if (required.some(key=>row[key] !== true) || denied.some(key=>row[key] !== false)) {
    throw new Error("NEXUS_BOARD_READER_ROLE_DENIED");
  }
}

/**
 * After the caller authenticates the owner or brand member, this function
 * requires a restricted reader account and passes it only to a read callback.
 * No raw credentials or database errors should be returned to the browser.
 */
export async function withNexusBoardReader<T>(
  databaseUrl: string,
  applicationName: "realtyflow-nexus-task-board-readonly" | "realtyflow-nexus-task-board-staff-readonly",
  callback: (client:NexusTaskBoardQueryClient)=>Promise<T>,
): Promise<T> {
  const url = parseNexusBoardDatabaseUrl(databaseUrl);
  const pg = require("pg") as {
    Client: new (options:Record<string,unknown>)=>NexusBoardReaderClient;
  };
  const client = new pg.Client({
    connectionString:url.toString(),
    ssl:{rejectUnauthorized:true},
    connectionTimeoutMillis:4000,
    statement_timeout:4000,
    application_name:applicationName,
  });
  try {
    await client.connect();
    await assertNexusBoardReadOnlyRole(client);
    return await callback(client);
  } finally {
    await client.end().catch(()=>undefined);
  }
}
