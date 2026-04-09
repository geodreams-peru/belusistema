// Script de migración idempotente para ventas y gastos de contabilidad
// Copia datos desde la base antigua (mini sistema contable-operativo para BELÚ/database.db)
// hacia la base nueva (BELU_SYSTEM/data/contabilidad.db), sin duplicar registros.
// Uso: node migrate_contabilidad.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const target = path.resolve(__dirname, 'data/contabilidad.db');
const source = path.resolve(__dirname, '../mini sistema contable-operativo para BELÚ/database.db');

const db = new sqlite3.Database(target);
function run(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function (err) { err ? rej(err) : res(this); }));
}
function get(sql, params = []) {
  return new Promise((res, rej) => db.get(sql, params, (err, row) => err ? rej(err) : res(row)));
}

(async () => {
  try {
    await run('PRAGMA foreign_keys = OFF');
    await run('ATTACH DATABASE ? AS src', [source]);

    const beforeV = await get('SELECT COUNT(*) AS c FROM ventas');
    const beforeG = await get('SELECT COUNT(*) AS c FROM gastos');

    const insV = await run(`
      INSERT INTO ventas (fecha, efectivo, tarjeta, mixto_efectivo, mixto_tarjeta, total, notas, created_at)
      SELECT s.fecha, s.efectivo, s.tarjeta, s.mixto_efectivo, s.mixto_tarjeta, s.total, s.notas, s.created_at
      FROM src.ventas s
      WHERE NOT EXISTS (
        SELECT 1 FROM ventas t
        WHERE t.fecha=s.fecha
          AND IFNULL(t.efectivo,0)=IFNULL(s.efectivo,0)
          AND IFNULL(t.tarjeta,0)=IFNULL(s.tarjeta,0)
          AND IFNULL(t.mixto_efectivo,0)=IFNULL(s.mixto_efectivo,0)
          AND IFNULL(t.mixto_tarjeta,0)=IFNULL(s.mixto_tarjeta,0)
          AND IFNULL(t.total,0)=IFNULL(s.total,0)
          AND IFNULL(t.notas,'')=IFNULL(s.notas,'')
      )
    `);

    const insG = await run(`
      INSERT INTO gastos (fecha, tipo, descripcion, monto, notas, created_at)
      SELECT s.fecha, s.tipo, s.descripcion, s.monto, s.notas, s.created_at
      FROM src.gastos s
      WHERE NOT EXISTS (
        SELECT 1 FROM gastos t
        WHERE t.fecha=s.fecha
          AND IFNULL(t.tipo,'')=IFNULL(s.tipo,'')
          AND IFNULL(t.descripcion,'')=IFNULL(s.descripcion,'')
          AND IFNULL(t.monto,0)=IFNULL(s.monto,0)
          AND IFNULL(t.notas,'')=IFNULL(s.notas,'')
      )
    `);

    const afterV = await get('SELECT COUNT(*) AS c FROM ventas');
    const afterG = await get('SELECT COUNT(*) AS c FROM gastos');
    const rngV = await get('SELECT MIN(fecha) as minf, MAX(fecha) as maxf FROM ventas');
    const rngG = await get('SELECT MIN(fecha) as minf, MAX(fecha) as maxf FROM gastos');

    console.log('ventas_before:', beforeV.c);
    console.log('ventas_inserted:', insV.changes);
    console.log('ventas_after:', afterV.c);
    console.log('ventas_range:', rngV.minf, '->', rngV.maxf);

    console.log('gastos_before:', beforeG.c);
    console.log('gastos_inserted:', insG.changes);
    console.log('gastos_after:', afterG.c);
    console.log('gastos_range:', rngG.minf, '->', rngG.maxf);

    await run('DETACH DATABASE src');
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
