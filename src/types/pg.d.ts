declare module "pg" {
  export interface QueryResult<T = Record<string, unknown>> {
    rows: T[];
  }

  export interface ClientBase {
    query<T = Record<string, unknown>>(
      sql: string,
      values?: unknown[],
    ): Promise<QueryResult<T>>;
  }

  export class Client implements ClientBase {
    constructor(options?: {
      connectionString?: string;
      statement_timeout?: number;
      connectionTimeoutMillis?: number;
    });
    connect(): Promise<void>;
    query<T = Record<string, unknown>>(
      sql: string,
      values?: unknown[],
    ): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
}
