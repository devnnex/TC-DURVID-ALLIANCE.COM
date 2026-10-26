import { createHash } from 'node:crypto';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const payloadHash = (statements: string[]) => sha256(statements.map(s => s.trim()).join(';\n') + ';\n');
const block = (statements: string[]) => [
  'BEGIN', ...statements.map(sql => `  EXECUTE IMMEDIATE q'~${sql}~';`),
  '  COMMIT;', 'EXCEPTION', '  WHEN OTHERS THEN', '    ROLLBACK;', '    RAISE;', 'END;'
].join('\n');

// Convert these SQL-only base migrations to one anonymous block. Dynamic SQL is
// necessary: Oracle compiles the block before the new tables have been created.
export function wrapMigration(filename: string, source: string): string {
  if (/q'~|~'|\b(?:BEGIN|DECLARE)\b/i.test(source)) throw new Error('El origen debe contener únicamente las sentencias SQL base.');
  const statements = source.split(';').map(s => s.trim()).filter(Boolean);
  if (!statements.length) throw new Error('La migración está vacía.');
  // These six base files contain no semicolons inside literals. Fail instead of
  // silently splitting a future file with a different syntax.
  for (const statement of statements) {
    if ((statement.match(/'/g) || []).length % 2) throw new Error('No se puede dividir una sentencia con punto y coma dentro de un literal.');
  }
  return [
    `-- ${filename}`,
    '-- Copia TODO este archivo en Oracle Database Actions y pulsa el boton verde.',
    '-- Ejecutar como una sola sentencia PL/SQL. COMMIT incluido.',
    `-- Previous SQL SHA256: ${sha256(source)}`,
    `-- Payload SHA256: ${payloadHash(statements)}`,
    block(statements),
    ''
  ].join('\n');
}

export function prepareMigration(source: string) {
  const executable = source.replace(/^\s*--[^\n]*(?:\n|$)/gm, '').trim().replace(/\n\s*\/\s*$/, '').trim();
  if (!/^(BEGIN|DECLARE)\b/i.test(executable) || !/END;\s*$/i.test(executable)) {
    throw new Error('La migración debe contener un único bloque PL/SQL completo.');
  }
  const expectedPayload = source.match(/^-- Payload SHA256: ([a-f0-9]{64})$/m)?.[1];
  const previousChecksum = source.match(/^-- Previous SQL SHA256: ([a-f0-9]{64})$/m)?.[1];
  if (previousChecksum) {
    const statements = [...executable.matchAll(/EXECUTE IMMEDIATE q'~([\s\S]*?)~';/g)].map(m => m[1]);
    if (!expectedPayload || !statements.length || payloadHash(statements) !== expectedPayload || executable !== block(statements)) {
      throw new Error('El SQL cambió: no se puede reutilizar el checksum del formato anterior.');
    }
  }
  return { sql: executable, checksum: sha256(source), previousChecksum };
}

export async function executeMigration(connection: { execute(sql: string): Promise<unknown> }, source: string) {
  const migration = prepareMigration(source);
  await connection.execute(migration.sql);
}
