import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function database(path=':memory:'){
 const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 return {sqlite,prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}};},async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const r=[];for(const s of statements)r.push(await s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
export function migrate(db){db.sqlite.exec(readFileSync(new URL('../drizzle/0000_shallow_paibok.sql',import.meta.url),'utf8'));}
