import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { executeMigration, prepareMigration, wrapMigration } from '../scripts/sql-migration';

const files = ['001_businesses.sql','002_locations.sql','003_identity.sql','004_units_catalog.sql','005_sync_audit.sql','006_reference_data.sql'];
const load = (file: string) => readFile(new URL(`../database/migrations/${file}`, import.meta.url), 'utf8');

describe('Migraciones Oracle: archivo completo con una ejecución', () => {
  it.each(files)('%s se envía como un único bloque, conserva su SQL y confirma al terminar', async file => {
    const source = await load(file);
    const execute = vi.fn(async (_sql: string) => ({}));
    await executeMigration({ execute }, source);
    expect(execute).toHaveBeenCalledTimes(1);
    const sql = execute.mock.calls[0][0];
    expect(sql).toMatch(/^BEGIN\n/);
    expect(sql).toMatch(/\n  COMMIT;\nEXCEPTION\n  WHEN OTHERS THEN\n    ROLLBACK;\n    RAISE;\nEND;$/);
    expect(sql).not.toMatch(/\n\s*\/\s*$/);
    const info = prepareMigration(source);
    expect(info.previousChecksum).toMatch(/^[a-f0-9]{64}$/);
    // All original base files had this exact formatting. Reconstructing their
    // SQL verifies this conversion changed packaging, not table definitions/data.
    const original = [...sql.matchAll(/EXECUTE IMMEDIATE q'~([\s\S]*?)~';/g)].map(m => m[1]).join(';\n') + ';\n';
    expect(createHash('sha256').update(original).digest('hex')).toBe(info.previousChecksum);
  });

  it('conserva 17 tablas, 5 índices y los datos de referencia originales', async () => {
    const sources = await Promise.all(files.map(load));
    const sql = sources.map(source => [...source.matchAll(/EXECUTE IMMEDIATE q'~([\s\S]*?)~';/g)].map(m => m[1]).join('\n')).join('\n');
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(17);
    expect(sql.match(/CREATE INDEX /g)).toHaveLength(5);
    expect(sql.match(/INSERT INTO roles VALUES /g)).toHaveLength(8);
    expect(sql.match(/INSERT INTO units_of_measure VALUES /g)).toHaveLength(7);
    expect(sql).toContain('FOREIGN KEY(business_id,category_id) REFERENCES product_categories(business_id,id)');
    expect(sql).toContain("('lb','Libras','MASS',453.59237)");
  });

  it('no acepta el checksum anterior si cambia una definición o se añade otra sentencia', async () => {
    const source = await load('002_locations.sql');
    expect(() => prepareMigration(source.replace('name VARCHAR2(160)', 'name VARCHAR2(80)'))).toThrow('El SQL cambió');
    expect(() => prepareMigration(source.replace('  COMMIT;', "  EXECUTE IMMEDIATE 'DROP TABLE businesses';\n  COMMIT;"))).toThrow('El SQL cambió');
  });

  it('propaga el error de Oracle sin simular éxito ni hacer un segundo envío', async () => {
    const error = new Error('ORA-00955: name is already used by an existing object');
    const execute = vi.fn(async (_sql: string) => { throw error; });
    await expect(executeMigration({ execute }, await load('002_locations.sql'))).rejects.toBe(error);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('mantiene el terminador PL/SQL y permite quitar un separador de SQL*Plus al usar el driver', () => {
    const source = wrapMigration('test.sql', "CREATE TABLE test_table (id NUMBER PRIMARY KEY);\nINSERT INTO test_table VALUES (1);\n");
    expect(prepareMigration(source + '/\n').sql).toMatch(/END;$/);
    expect(() => prepareMigration('CREATE TABLE test_table (id NUMBER);')).toThrow('único bloque');
    expect(() => wrapMigration('test.sql', "INSERT INTO test_table VALUES ('a;b');")).toThrow('punto y coma');
  });
});
