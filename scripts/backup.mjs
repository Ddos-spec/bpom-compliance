/** Consistent SQLite backup + private photos. Run on a trusted host; backup contains PII. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
const source=path.resolve(process.env.TERA_DATA_DIR||'data');
const destination=path.resolve(process.env.TERA_BACKUP_DIR||'backups');
if(source===destination||destination.startsWith(source+path.sep))throw Error('Backup destination must be outside data dir.');
const database=path.join(source,'tera_public.db');
if(!fs.existsSync(database))throw Error(`No database at ${database}`);
fs.mkdirSync(destination,{recursive:true,mode:0o700});
const target=path.join(destination,`tera-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(3).toString('hex')}`);
fs.mkdirSync(target,{mode:0o700});
const db=new DatabaseSync(database);
try{await backup(db,path.join(target,'tera_public.db'));}finally{db.close();}
const photos=path.join(source,'private_images');
if(fs.existsSync(photos))fs.cpSync(photos,path.join(target,'private_images'),{recursive:true,force:false});
const manifest={createdAt:new Date().toISOString(),files:[]};
function inspect(dir){for(const it of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,it.name);if(it.isDirectory())inspect(full);else if(it.isFile()){const data=fs.readFileSync(full);manifest.files.push({path:path.relative(target,full),bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});}}}
inspect(target);fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
console.log(`Backup ready: ${target} (${manifest.files.length} files). Keep it encrypted and off-site.`);
