interface IKnex {
  raw: (
    arg0: string,
    arg1?: {
      schemaOwner?: any;
      tableName?: any;
      constraintType?: any;
      viewName?: any;
    }
  ) => any;
}

const commands = () => {
  const getConstraints = (
    knex: IKnex,
    schemaOwner: string | any[],
    tableName?: string | any[],
    constraintType?: string
  ) => {
    const sql =
      `SELECT DISTINCT
                        cons.constraint_name as "name",
                        cons.constraint_schema as "schema",
                        keycolumns.table_name as "table",
                        keycolumns.column_name as "column",
                        keycolumns.ordinal_position as "ordinal",
                        refs.unique_constraint_name as "ucName",
                        cons2.table_name AS "ucTable",
                        cons2.table_schema AS "ucSchema",
                        refs.delete_rule AS "deleteRule",
                        refs.update_rule AS "updateRule",
                        kc.column_name as "ucColumn"
                      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS cons
                          INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS keycolumns
                              ON (cons.constraint_catalog = keycolumns.constraint_catalog
                                  OR cons.constraint_catalog IS NULL) AND
                              cons.constraint_schema = keycolumns.constraint_schema AND
                              cons.constraint_name = keycolumns.constraint_name AND
                              cons.table_name = keycolumns.table_name
                          LEFT OUTER JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS AS refs
                              ON (cons.constraint_catalog = refs.constraint_catalog
                                  OR cons.constraint_catalog IS NULL) AND
                              cons.constraint_schema = refs.constraint_schema AND
                              cons.constraint_name = refs.unique_constraint_name
                          LEFT OUTER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS cons2
                              ON (cons2.constraint_catalog = refs.constraint_catalog
                                  OR cons2.constraint_catalog IS NULL) AND
                              cons2.constraint_schema = refs.constraint_schema AND
                              cons2.constraint_name = refs.constraint_name
                          LEFT OUTER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS kc
                              ON (cons.constraint_catalog = kc.constraint_catalog
                                  OR cons.constraint_catalog IS NULL) AND
                              kc.constraint_schema = cons.constraint_schema AND
                              kc.constraint_name = refs.constraint_name AND
                              kc.table_name = cons2.table_name
                      WHERE ` +
      (schemaOwner && schemaOwner.length > 0
        ? "(cons.constraint_schema = :schemaOwner) AND "
        : "") +
      (tableName && tableName.length > 0
        ? "(keycolumns.table_name = :tableName) AND "
        : "") +
      `
                          cons.constraint_type = :constraintType
                      ORDER BY
                        cons.constraint_schema, keycolumns.table_name, cons.constraint_name, keycolumns.ordinal_position`;
    return knex.raw(sql, {
      schemaOwner,
      tableName,
      constraintType,
    });
  };

  return {
    getPgTypes: (knex: IKnex) => {
      const sql = `SELECT distinct
                      typelem as "id",
                        format_type(typelem, NULL) as "name"
                      from pg_type
                      where typelem > 0
                        order by format_type(typelem, NULL)`;
      return knex.raw(sql);
    },

    getCatalog: (knex: IKnex) =>
      knex.raw(`SELECT "datname" as "name" FROM "pg_catalog"."pg_database"`),

    getDataTypes: (knex: IKnex) => {
      const sql = `SELECT DISTINCT
                        -- t.table_schema, c.table_name, c.column_name, c.data_type,
                        case when c.DATA_TYPE = 'USER-DEFINED' THEN c.UDT_NAME
                             when c.DATA_TYPE = 'ARRAY' THEN substring(c.UDT_NAME,2)||'[]'
                             ELSE c.DATA_TYPE
                        end as "typeName",
                        c.UDT_NAME as "internalName",
                        c.DATA_TYPE = 'USER-DEFINED' as "isUserDefined",
                        false as "isAssemblyType",
                        (c.CHARACTER_MAXIMUM_LENGTH is not null and c.CHARACTER_MAXIMUM_LENGTH > 0) as "hasMaxLength",
                        (c.NUMERIC_PRECISION is not null and c.NUMERIC_PRECISION > 0) as "hasPrecision",
                        (c.NUMERIC_SCALE is not null and c.NUMERIC_SCALE > 0) as "hasScale"
                      FROM INFORMATION_SCHEMA.COLUMNS c
                        JOIN information_schema.TABLES t on
                          c.TABLE_CATALOG = t.TABLE_CATALOG AND
                          c.TABLE_SCHEMA = t.TABLE_SCHEMA AND
                          c.TABLE_NAME = t.TABLE_NAME
                      WHERE t.table_type = 'BASE TABLE' and t.table_schema not in ('pg_catalog', 'information_schema')
                      ORDER BY "typeName"`;
      return knex.raw(sql);
    },

    getVersionInfo: (knex: IKnex) => {
      const sql = `select version() as "version"`;
      return knex.raw(sql);
    },

    getUsers: (knex: IKnex) => {
      // be careful: MUST BE ADMIN to run this query
      const sql = `SELECT u.usename AS "name" FROM pg_catalog.pg_user u ORDER BY 1`;
      return knex.raw(sql);
    },

    getSchemas: (knex: IKnex) => {
      const sql = `SELECT distinct nspname as "name" from pg_catalog.pg_namespace
                     WHERE nspname NOT IN ('SYS', 'SYSADMIN', 'pg_catalog')`;
      return knex.raw(sql);
    },

    getTables: (knex: IKnex, schemaOwner: string | any[]) => {
      const sql =
        `SELECT
                          TABLE_SCHEMA as "schema",
                          TABLE_NAME as "name",
                          '' as "description"
                     FROM INFORMATION_SCHEMA.TABLES
                     WHERE ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(TABLE_SCHEMA = :schemaOwner) AND "
          : "") +
        `
                        TABLE_TYPE = 'BASE TABLE'
                     ORDER BY TABLE_SCHEMA, TABLE_NAME
                      `;
      return knex.raw(sql, { schemaOwner });
    },

    getTableColumns: (
      knex: IKnex,
      schemaOwner: string | any[],
      tableName?: string | any[]
    ) => {
      const sql =
        `
          SELECT
            c.TABLE_SCHEMA as "schema",
            c.TABLE_NAME as "table",
            COLUMN_NAME as "name",
            ORDINAL_POSITION as "ordinal",
            COLUMN_DEFAULT as "default",
            (IS_NULLABLE <> 'NO') as "isNullable",
            case when c.DATA_TYPE = 'USER-DEFINED' THEN c.UDT_NAME
                 when c.DATA_TYPE = 'ARRAY' THEN substring(c.UDT_NAME,2)||'[]'
                 ELSE c.DATA_TYPE
            end as "dataType",
            CHARACTER_MAXIMUM_LENGTH as "maxLength",
            NUMERIC_PRECISION as "precision",
            NUMERIC_SCALE as "scale",
            '' as "description",
            DATETIME_PRECISION as "dateTimePrecision",
            CHARACTER_SET_NAME as "characterSet"
          FROM INFORMATION_SCHEMA.COLUMNS c
            JOIN INFORMATION_SCHEMA.TABLES t
             ON
                c.TABLE_SCHEMA = t.TABLE_SCHEMA AND
                c.TABLE_NAME = t.TABLE_NAME
          where ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(c.TABLE_SCHEMA = :schemaOwner) AND "
          : "") +
        (tableName && tableName.length > 0
          ? "(c.TABLE_NAME = :tableName) AND "
          : "") +
        `
              t.TABLE_TYPE = 'BASE TABLE'
           order by
              c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION`;
      return knex.raw(sql, { schemaOwner, tableName });
    },

    getViews: (knex: IKnex, schemaOwner: string | any[]) => {
      const sql =
        `SELECT
                        TABLE_SCHEMA as "schema",
                        TABLE_NAME as "name",
                        '' as "description"
                     FROM INFORMATION_SCHEMA.VIEWS
                     WHERE ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(TABLE_SCHEMA = :schemaOwner) AND "
          : "") +
        `
                      1 = 1
                     ORDER BY TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME
                      `;
      return knex.raw(sql, { schemaOwner });
    },

    getViewColumns: (
      knex: IKnex,
      schemaOwner: string | any[],
      viewName?: string | any[]
    ) => {
      const sql =
        `
          SELECT
            c.TABLE_SCHEMA as "schema",
            c.TABLE_NAME as "view",
            COLUMN_NAME as "name",
            ORDINAL_POSITION as "ordinal",
            COLUMN_DEFAULT as "default",
            (IS_NULLABLE <> 'NO') as "isNullable",
            case when c.DATA_TYPE = 'USER-DEFINED' THEN c.UDT_NAME
                 when c.DATA_TYPE = 'ARRAY' THEN substring(c.UDT_NAME,2)||'[]'
                 ELSE c.DATA_TYPE
            end as "dataType",
            CHARACTER_MAXIMUM_LENGTH as "maxLength",
            NUMERIC_PRECISION as "precision",
            NUMERIC_SCALE as "scale",
            '' as "description",
            DATETIME_PRECISION as "dateTimePrecision",
            CHARACTER_SET_NAME as "characterSet"
          FROM INFORMATION_SCHEMA.COLUMNS c
            JOIN INFORMATION_SCHEMA.VIEWS t
             ON
                c.TABLE_SCHEMA = t.TABLE_SCHEMA AND
                c.TABLE_NAME = t.TABLE_NAME
          where ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(c.TABLE_SCHEMA = :schemaOwner) AND "
          : "") +
        (viewName && viewName.length > 0
          ? "(c.TABLE_NAME = :viewName) AND "
          : "") +
        `
              0 = 0
           order by
              c.TABLE_SCHEMA, c.TABLE_NAME, ORDINAL_POSITION`;
      return knex.raw(sql, { schemaOwner, viewName });
    },

    getColumnDescriptions: (
      knex: IKnex,
      schemaOwner: string | any[],
      tableName?: string | any[]
    ) => {
      const sql =
        `SELECT
                          cols.table_schema AS "schema",
                          cols.table_name AS "table",
                          cols.column_name AS "name",
                          null AS "description"
                      FROM
                          information_schema.columns cols
                      WHERE ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(cols.table_schema = :schemaOwner) AND "
          : "") +
        (tableName && tableName.length > 0
          ? "(cols.table_name = :tableName) AND "
          : "") +
        `
                          0 = 0
                      ORDER BY
                            cols.table_schema, cols.table_name, cols.column_name`;
      return knex.raw(sql, { schemaOwner, tableName });
    },

    // hard coded to no sequences - rareddy
    hasSequences: (knex: IKnex, schemaOwner: any) => {
      const sql = `SELECT 0`;
      return knex.raw(sql, { schemaOwner });
    },

    getSequences: (knex: IKnex, schemaOwner: string | any[]) => {
      const sql =
        `SELECT
                         sequence_schema as "schema",
                         sequence_name as "name",
                         data_type as "dataType",
                         start_value as "minValue",
                         increment as "increment",
                         cycle_option as "isCycling"
                      FROM information_schema.sequences
                      WHERE ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(sequence_schema = :schemaOwner) AND "
          : "") +
        `
                          0 = 0
                      ORDER BY sequence_name`;
      return knex.raw(sql, { schemaOwner });
    },

    getCheckConstraints: (
      knex: IKnex,
      schemaOwner: string | any[],
      tableName?: string | any[]
    ) => {
      const sql =
        `SELECT
                        cons.constraint_name as "name",
                        cons.constraint_schema as "schema",
                        cons.table_name as "table",
                        null AS "expression"
                      FROM pg_catalog.INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS cons
                      WHERE  ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(cons.constraint_schema = :schemaOwner) AND "
          : "") +
        (tableName && tableName.length > 0
          ? "(cons.table_name = :tableName) AND "
          : "") +
        `
                           cons.constraint_type = 'CHECK'
                      ORDER BY cons.constraint_schema, cons.table_name, cons.constraint_name
                      `;
      return knex.raw(sql, { schemaOwner, tableName });
    },

    getIndexes: (
      knex: IKnex,
      schemaOwner: string | any[],
      tableName?: string | any[]
    ) => {
      const sql =
        `
                      SELECT
                          n.nspname as "schema",
                          t.relname as "table",
                          i.relname as "name",
                          a.attname as "column",
                          ix.Indisunique as "isUnique",
                          ix.Indisprimary as "isPrimary"
                      FROM
                          pg_catalog.pg_class i
                        JOIN pg_catalog.pg_index ix ON ix.indexrelid = i.oid
                        JOIN pg_catalog.pg_class t ON ix.indrelid = t.oid
                        JOIN pg_attribute a on t.oid = a.attrelid AND a.attnum = ANY(ix.indkey)
                        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = i.relnamespace
                      WHERE ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(n.nspname = :schemaOwner) AND "
          : "") +
        (tableName && tableName.length > 0
          ? "(t.relname = :tableName) AND "
          : "") +
        `
                          i.relkind = 'i'
                          AND n.nspname not like '%pg_%'
                          AND pg_catalog.pg_table_is_visible(i.oid)
                          AND t.relkind = 'r'
                      ORDER BY
                          n.nspname, t.relname, i.relname, a.attnum`;
      return knex.raw(sql, { schemaOwner, tableName });
    },

    getForeignKeyConstraints: (
      knex: IKnex,
      schemaOwner: string | any[],
      tableName?: string | any[]
    ) => getConstraints(knex, schemaOwner, tableName, "FOREIGN KEY"),

    getUniqueKeyConstraints: (
      knex: IKnex,
      schemaOwner: string | any[],
      tableName?: string | any[]
    ) => getConstraints(knex, schemaOwner, tableName, "UNIQUE"),

    getPrimaryKeyConstraints: (
      knex: IKnex,
      schemaOwner: string | any[],
      tableName?: string | any[]
    ) => getConstraints(knex, schemaOwner, tableName, "PRIMARY KEY"),

    getFunctions: (knex: IKnex, schemaOwner: string | any[]) => {
      const sql =
        `SELECT
                        ns.nspname as "schema",
                        pr.proname as "name",
                        '' as "description",
                        null as "language",
                        null as "sql",
                        format_type(pr.prorettype, NULL) AS "dataType"
                      FROM pg_proc pr
                        LEFT OUTER JOIN pg_type tp ON tp.oid = pr.prorettype
                        INNER JOIN pg_namespace ns ON pr.pronamespace = ns.oid
                      WHERE
                        ns.nspname NOT LIKE 'pg_%' AND
                        ns.nspname <> 'information_schema' AND ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(ns.nspname = :schemaOwner) AND "
          : "") +
        `
                        tp.typname <> 'trigger'
                      ORDER BY ns.nspname, pr.proname`;
      return knex.raw(sql, { schemaOwner });
    },

    getFunctionArguments: (knex: IKnex, schemaOwner: string | any[]) => {
      const sql =
        `SELECT
                         ns.nspname AS "schema",
                         pr.proname AS "procedureName",
                         pr.proargnames as "parameterNames",
                         pr.proargmodes as "parameterModes",
                         null as "parameterDefinitions",
                         pr.proargtypes as "inDataTypes",
                         pr.proallargtypes as "allDataTypes"
                     FROM pg_proc pr
                        LEFT OUTER JOIN pg_type tp ON tp.oid = pr.prorettype
                        INNER JOIN pg_namespace ns ON pr.pronamespace = ns.oid
                     WHERE ` +
        (schemaOwner && schemaOwner.length > 0
          ? "(ns.nspname = :schemaOwner) AND "
          : "") +
        `
                         tp.typname <> 'trigger' AND
                         ns.nspname NOT LIKE 'pg_%' AND
                         ns.nspname != 'information_schema'
                     ORDER BY pr.proname`;
      return knex.raw(sql, { schemaOwner });
    },
  };
};

export default commands();
