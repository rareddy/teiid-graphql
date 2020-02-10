export default CMDS;
declare namespace CMDS {
    export function getPgTypes(knex: any): any;
    export function getCatalog(knex: any): any;
    export function getDataTypes(knex: any): any;
    export function getVersionInfo(knex: any): any;
    export function getUsers(knex: any): any;
    export function getSchemas(knex: any): any;
    export function getTables(knex: any, schemaOwner: any): any;
    export function getTableColumns(knex: any, schemaOwner: any, tableName: any): any;
    export function getViews(knex: any, schemaOwner: any): any;
    export function getViewColumns(knex: any, schemaOwner: any, viewName: any): any;
    export function getColumnDescriptions(knex: any, schemaOwner: any, tableName: any): any;
    export function hasSequences(knex: any, schemaOwner: any): any;
    export function getSequences(knex: any, schemaOwner: any): any;
    export function getCheckConstraints(knex: any, schemaOwner: any, tableName: any): any;
    export function getIndexes(knex: any, schemaOwner: any, tableName: any): any;
    export function getForeignKeyConstraints(knex: any, schemaOwner: any, tableName: any): any;
    export function getUniqueKeyConstraints(knex: any, schemaOwner: any, tableName: any): any;
    export function getPrimaryKeyConstraints(knex: any, schemaOwner: any, tableName: any): any;
    export function getFunctions(knex: any, schemaOwner: any): any;
    export function getFunctionArguments(knex: any, schemaOwner: any): any;
}
