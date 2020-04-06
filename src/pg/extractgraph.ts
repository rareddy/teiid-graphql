import co from "co";
import { printType } from "graphql";
import _ from "lodash";
import cmds from "./command";

interface IReverseForeignKeys {
  name: string;
  schemaName: string;
  tableName: string;
  columnName: string;
}

const extractTypes = () => {
  const graphql = require("graphql");

  const getRows = (result) => {
    if (result.rows) {
      return result.rows;
    }
    return result;
  };
  const keyValMap = (list, keyFn, valFn) => {
    return list.reduce((map, item) => {
      map[keyFn(item)] = valFn(item);
      return map;
    }, Object.create(null));
  };

  const parseType = (type) => {
    if (
      type === "bigint" ||
      type === "integer" ||
      type === "smallint" ||
      type === "serial" ||
      type === "bigserial"
    ) {
      return graphql.GraphQLInt;
    } else if (
      type === "decimal" ||
      type === "numeric" ||
      type === "real" ||
      type === "double precision"
    ) {
      return graphql.GraphQLFloat;
    } else if (type === "boolean") {
      return graphql.GraphQLBoolean;
    }
    return graphql.GraphQLString;
  };

  const getGraphType = (row) => {
    return parseType(row.dataType);
  };

  return {
    loadFromSource: function loadFromSource(knex) {
      return co(function*() {
        "use strict";
        // var graphql = require("graphql");
        const pgTypes = _.keyBy(getRows(yield cmds.getPgTypes(knex)), "id");

        const schemaNames = _.map(getRows(yield cmds.getSchemas(knex)), "name");

        const rawTableTypes = {};

        for (const schemaName of schemaNames) {
          const schemaTableColumns = _.map(
            getRows(yield cmds.getTableColumns(knex, schemaName)),
            (row) =>  {
              const col = {
                table: row.table,
                name: row.name,
                description: "", // gets populated later
                ordinal: row.ordinal,
                dataType: row.dataType,
                maxLength: row.maxLength,
                precision: row.precision,
                scale: row.scale,
                dateTimePrecision: row.dateTimePrecision,
                characterSet: row.characterSet,
                isNullable: row.isNullable,
                default: row.default
                  ? { expression: row.default, constraintName: null }
                  : null, // gets populated later
                isPartOfPrimaryKey: false, // gets populated later
                isPrimaryKey: false, // gets populated later
                isPartOfUniqueKey: false, // gets populated later
                isUnique: false, // gets populated later
                isForeignKey: false, // gets populated later
                reverseForeignKeys: {} as IReverseForeignKeys,
                foreignKeyName: '' // gets populated later
              };
              return col;
            }
          );

          const primaryKeyConstraints = getRows(
            yield cmds.getPrimaryKeyConstraints(knex, schemaName)
          );
          const uniqueKeyConstraints = getRows(
            yield cmds.getUniqueKeyConstraints(knex, schemaName)
          );
          const foreignKeyConstraints = getRows(
            yield cmds.getForeignKeyConstraints(knex, schemaName)
          );

          // get schema tables
          const tables = getRows(yield cmds.getTables(knex, schemaName));
          if (tables.length === 0) {
            continue;
          }

          // initialize
          _.forEach(tables, (t) => {
            rawTableTypes[t.name] = {
              name: t.name,
              description: t.description,
              typeFields: [],
            };
          });

          _.forEach(tables, (t) => {
            const columns = _.keyBy(
              _.filter(schemaTableColumns, { table: t.name }),
              "name"
            );

            // build relations
            const pks = _.keyBy(
              _.filter(primaryKeyConstraints, { table: t.name }),
              "table"
            );
            _.forEach(pks, (pkc) => {
              columns[pkc.column].isPrimaryKey = true;
            });

            const uniques = _.keyBy(
              _.filter(uniqueKeyConstraints, { table: t.name }),
              "table"
            );
            _.forEach(uniques, (unique) => {
              columns[unique.column].isUnique = true;
            });

            const fks = _.keyBy(
              _.filter(foreignKeyConstraints, { table: t.name }),
              "table"
            );
            _.forEach(fks, (fk) => {
              columns[fk.column].isForeignKey = true;
              columns[fk.column].foreignKeyName = fk.name;
              columns[fk.column].reverseForeignKeys = {
                name: fk.name,
                schemaName: fk.ucSchema,
                tableName: fk.ucTable,
                columnName: fk.ucColumn,
              };
            });

            _.forEach(columns, (col) => {
              const field = {
                name: col.name,
                type:
                  col.isPrimaryKey ||
                  col.isPartOfPrimaryKey ||
                  col.isUnique ||
                  !col.isNullable
                    ? new graphql.GraphQLNonNull(getGraphType(col))
                    : getGraphType(col),
                description: " ",
              };
              rawTableTypes[t.name].typeFields.push(field);

              // make relationships
              // one2one
              if (col.isForeignKey && (col.isPrimaryKey || col.isUnique)) {
                rawTableTypes[t.name].typeFields.push({
                  name: col.reverseForeignKeys.tableName,
                  type: new graphql.GraphQLObjectType({
                    name: col.reverseForeignKeys.tableName,
                  }),
                  description:
                    "@db.OneToOne: '" + col.reverseForeignKeys.columnName + "'",
                });
                // reverse-lookup
                rawTableTypes[col.reverseForeignKeys.tableName].typeFields.push(
                  {
                    name: col.table,
                    type: new graphql.GraphQLObjectType({ name: col.table }),
                    description: "@db.oneToOne: '" + col.name + "'",
                  }
                );
              } else if (
                col.isForeignKey &&
                !col.isPrimaryKey &&
                !col.isUnique
              ) {
                // One2Many
                rawTableTypes[t.name].typeFields.push({
                  name: col.reverseForeignKeys.tableName,
                  type: new graphql.GraphQLObjectType({
                    name: col.reverseForeignKeys.tableName,
                  }),
                  description:
                    "@db.ManyToOne: '" +
                    col.reverseForeignKeys.columnName +
                    "'",
                });
                // reverse-lookup
                rawTableTypes[col.reverseForeignKeys.tableName].typeFields.push(
                  {
                    name: col.table + "s",
                    type: new graphql.GraphQLList(
                      new graphql.GraphQLObjectType({ name: col.table })
                    ),
                    description: "@db.oneToMany: '" + col.name + "'",
                  }
                );
              }
            });
          });
        }

        const tableTypes: any[] = [];
        _.forEach(rawTableTypes, (t: any) => {
          tableTypes.push(
            new graphql.GraphQLObjectType({
              name: t.name,
              description: t.description,
              fields: keyValMap(
                t.typeFields,
                (keyFn) => {
                  return keyFn.name;
                },
                (valFn) => {
                  if (valFn.description !== " ") {
                    return { type: valFn.type, description: valFn.description };
                  } else {
                    return { type: valFn.type };
                  }
                }
              ),
            })
          );
        });

        // convert to a string
        let schema = " ";
        _.forEach(tableTypes, (type) => {
          schema += printType(type);
          schema += "\n";
        });
        console.log("Schema Retrieved:\n", schema);
        return schema;
      });
    },
  };
};

export default extractTypes();
