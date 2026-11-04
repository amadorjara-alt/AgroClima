import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const files=(await readdir(new URL('../js/',import.meta.url))).filter(name=>name.endsWith('.js'));
for(const file of files){
 const result=spawnSync(process.execPath,['--check',new URL('../js/'+file,import.meta.url).pathname],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
console.log(`${files.length} archivos JavaScript verificados.`);
