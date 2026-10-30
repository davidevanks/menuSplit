// Development checks only. The application itself needs no Node.js or packages.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
const KEY='menusplit.account.v1';

function boot({saved,failRead=false,failWrite=false}={}){
  const nodes=new Map(), store=new Map(saved===undefined?[]:[[KEY,saved]]);
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,checked:false,dataset:{},listeners:{},
      classList:{
        values:new Set(),
        toggle(name,force){
          const enabled=force===undefined?!this.values.has(name):Boolean(force);
          if(enabled)this.values.add(name);else this.values.delete(name);
          return enabled;
        },
        contains(name){return this.values.has(name);}
      },
      addEventListener(type,fn){this.listeners[type]=fn;},querySelectorAll(){return [];},focus(){},setCustomValidity(){},reportValidity(){},matches(){return false;}});
    return nodes.get(selector);
  };
  const dialogs=[],listeners={},downloads=[],revoked=[];let nextId=0;
  const sandbox={document:{querySelector:node,activeElement:null,body:{append(){}},createElement(){return {click(){downloads.push({name:this.download,blob:sandbox.blob});},remove(){}};}},crypto:{randomUUID:()=>`test-${++nextId}`},
    Blob,URL:{createObjectURL(blob){sandbox.blob=blob;return 'blob:test';},revokeObjectURL:url=>revoked.push(url)},setTimeout:fn=>fn(),
    localStorage:{getItem(k){if(failRead)throw Error('Access denied');return store.get(k)??null;},setItem(k,v){if(failWrite)throw Error('Quota exceeded');store.set(k,v);}},
    alert:message=>dialogs.push(message),confirm:()=>true,prompt:()=>null,
    addEventListener:(name,fn)=>listeners[name]=fn,location:{reload(){}},CSS:{escape:s=>s}};
  vm.runInNewContext(source,sandbox);
  return {api:sandbox.MenuSplit,node,store,dialogs,listeners,downloads,revoked,
    confirm(fn){sandbox.confirm=fn;},
    fire(selector,type,target){return node(selector).listeners[type]({target:target||node(selector),preventDefault(){}});},
    account(){return JSON.parse(store.get(KEY));}};
}
function assign(ui,productId,index,owner){
  ui.fire('#products','change',{value:owner,dataset:{unit:String(index)},matches:selector=>selector==='[data-unit]',closest:()=>({dataset:{product:productId}})});
}
function withParticipants(api,count){
  const account=api.freshAccount();
  account.people=Array.from({length:count},(_,i)=>({id:`person-${i}`,name:`Persona ${i}`,isMe:i===0,paid:false}));
  account.products.forEach((p,i)=>p.owners=p.owners.map((_,j)=>account.people[(i+j)%count].id));
  return account;
}

test('Filtrar pendientes combina búsqueda, asignaciones parciales y unidades gratuitas sin alterar la cuenta',()=>{
  const {api}=boot();const account=api.freshAccount();
  account.products=[
    {id:'partial',name:'Té caliente',price:5500,note:'',owners:['me',null]},
    {id:'done',name:'Té helado',price:6500,note:'',owners:['me']},
    {id:'free',name:'Cortesía',price:0,note:'',owners:[null]}
  ];
  const saved=JSON.stringify(account),ui=boot({saved});
  ui.node('#only-unassigned').checked=true;ui.fire('#only-unassigned','change');
  assert.match(ui.node('#products').innerHTML,/data-product="partial"/);
  assert.match(ui.node('#products').innerHTML,/data-product="free"/);
  assert.doesNotMatch(ui.node('#products').innerHTML,/data-product="done"/);
  assert.equal(ui.store.get(KEY),saved);
  ui.node('#search').value='té caliente';ui.fire('#search','input');
  assert.match(ui.node('#products').innerHTML,/data-product="partial"/);
  assert.doesNotMatch(ui.node('#products').innerHTML,/data-product="free"/);
  assign(ui,'partial',1,'me');
  assert.match(ui.node('#products').innerHTML,/sin asignar que coincidan/);
  ui.node('#search').value='';ui.fire('#search','input');
  assign(ui,'free',0,'me');
  assert.match(ui.node('#products').innerHTML,/No quedan productos con unidades sin asignar/);
  assert.equal(ui.node('#grand-total').textContent,'C$218.75');
  ui.node('#only-unassigned').checked=false;ui.fire('#only-unassigned','change');
  assert.match(ui.node('#products').innerHTML,/data-product="done"/);
  assign(ui,'done',0,'');
  ui.node('#only-unassigned').checked=true;ui.fire('#only-unassigned','change');
  assert.match(ui.node('#products').innerHTML,/data-product="done"/);
  const reloaded=boot({saved:ui.store.get(KEY)});
  assert.equal(reloaded.account().products[1].owners[0],null);
  assert.match(reloaded.node('#products').innerHTML,/data-product="partial"/);
});

test('Restablecer e importar limpian el filtro de pendientes',async()=>{
  const ui=boot();const account=withParticipants(ui.api,2);
  ui.node('#only-unassigned').checked=true;ui.fire('#only-unassigned','change');
  await importFile(ui,JSON.stringify(account));
  assert.equal(ui.node('#only-unassigned').checked,false);
  assert.match(ui.node('#products').innerHTML,/data-product="original-0"/);
  ui.node('#only-unassigned').checked=true;ui.fire('#only-unassigned','change');
  ui.fire('#reset','click');
  assert.equal(ui.node('#only-unassigned').checked,false);
});

test('La transcripción reproduce exactamente los cuatro importes y las 44 unidades',()=>{
  const {api}=boot();const c=api.calculate(api.freshAccount());
  assert.equal(c.subtotal,818447);assert.equal(c.tax,122767);assert.equal(c.tip,81845);assert.equal(c.total,1023059);
  assert.equal(c.totalUnits,44);assert.equal(c.assignedUnits,0);assert.equal(c.ready,false);
});
test('El reparto conserva los centavos y los cargos son proporcionales al consumo para 1–50 personas',()=>{
  const {api}=boot();
  for(let count=1;count<=50;count++){
    const c=api.calculate(withParticipants(api,count));
    for(const field of ['tax','tip']){
      assert.equal(c.people.reduce((s,p)=>s+p[field],0),c[field]);
      for(const person of c.people)assert.ok(Math.abs(person[field]-c[field]*person.consumption/c.subtotal)<1);
    }
    assert.equal(c.people.reduce((s,p)=>s+p.total,0),c.total);assert.equal(c.ready,true);
  }
});
test('Participantes sin consumo no pagan cargos; productos gratuitos requieren asignación',()=>{
  const {api}=boot();const account=withParticipants(api,2);
  account.products.forEach(p=>p.owners.fill('person-0'));
  let c=api.calculate(account);assert.equal(c.people[1].consumption,0);assert.equal(c.people[1].tax,0);assert.equal(c.people[1].tip,0);assert.equal(c.people[1].total,0);
  account.products.find(p=>p.price===0).owners[0]=null;
  c=api.calculate(account);assert.equal(c.unassigned,0);assert.equal(c.ready,false);
});
test('Pagos distinguen dinero recibido, parte propia y pendiente; cubrir todo deja saldo cero',()=>{
  const {api}=boot();const account=withParticipants(api,3);account.people[1].paid=true;
  let c=api.calculate(account);assert.equal(c.received,c.people[1].total);assert.equal(c.ownCovered,0);
  assert.equal(c.collect,c.people[2].total);assert.equal(c.pending,c.total-c.received);
  account.people[0].paid=true;c=api.calculate(account);assert.equal(c.ownCovered,c.people[0].total);
  account.people[2].paid=true;c=api.calculate(account);assert.equal(c.pending,0);assert.equal(c.collect,0);
});
test('Asignar, pagar, bloquear, desmarcar y restaurar funciona a través de los manejadores',()=>{
  const ui=boot();ui.node('#person-name').value='Ana';ui.fire('#add-person','submit');
  let account=ui.account();const ana=account.people.find(p=>!p.isMe);
  for(const product of account.products)product.owners.forEach((_,i)=>assign(ui,product.id,i,i%2?'me':ana.id));
  assert.equal(ui.node('#payment-instruction').textContent.includes('se reparten según el consumo'),true);
  ui.fire('#payments','change',{dataset:{payment:ana.id},checked:true,matches:()=>true});
  assert.equal(ui.node('#person-name').disabled,true);assert.equal(ui.node('#tax-rate').disabled,true);
  assert.equal(ui.node('#lock-notice').hidden,false);
  const before=ui.store.get(KEY);assign(ui,account.products[0].id,0,'me');assert.equal(ui.store.get(KEY),before);
  ui.fire('#payments','change',{dataset:{payment:ana.id},checked:false,matches:()=>true});
  assert.equal(ui.node('#person-name').disabled,false);assert.equal(ui.node('#lock-notice').hidden,true);
  const restored=boot({saved:ui.store.get(KEY)});assert.ok(restored.node('#people').innerHTML.includes('Ana'));
  assert.equal(restored.node('#assignment-caption').textContent,'44 de 44 unidades asignadas');
});
test('Eliminar un participante deja sus consumos sin asignar; Yo no se elimina',()=>{
  const ui=boot();ui.node('#person-name').value='Ana';ui.fire('#add-person','submit');
  const account=ui.account(),ana=account.people.find(p=>!p.isMe);assign(ui,account.products[0].id,0,ana.id);
  ui.fire('#people','click',{closest:()=>({dataset:{action:'delete-person'},closest:()=>({dataset:{person:ana.id}})})});
  assert.equal(ui.account().people.length,1);assert.equal(ui.account().products[0].owners[0],null);
  ui.fire('#people','click',{closest:()=>({dataset:{action:'delete-person'},closest:()=>({dataset:{person:'me'}})})});
  assert.equal(ui.account().people.length,1);
});
test('Guardado dañado y sin permisos no impide usar la sesión ni sobrescribe datos dañados',()=>{
  const bad=boot({saved:'{broken'});assert.equal(bad.node('#storage-error').hidden,false);
  bad.node('#person-name').value='Ana';bad.fire('#add-person','submit');assert.equal(bad.store.get(KEY),'{broken');
  bad.fire('#reset','click');assert.equal(bad.account().people.length,1);assert.equal(bad.node('#storage-error').hidden,true);
  for(const options of [{failRead:true,failWrite:true},{failWrite:true}]){
    const ui=boot(options);ui.node('#person-name').value='Ana';ui.fire('#add-person','submit');
    assert.ok(ui.node('#people').innerHTML.includes('Ana'));assert.equal(ui.node('#storage-error').hidden,false);
  }
});
test('Validación rechaza datos incoherentes; entradas monetarias no aceptan negativos ni fracciones de centavo',()=>{
  const {api}=boot();const valid=withParticipants(api,3);assert.equal(api.validAccount(valid),true);
  const mutations=[a=>a.version=3,a=>a.people[1].id=a.people[0].id,a=>a.products[0].owners[0]='unknown',a=>a.products[0].price=-1,a=>a.people[1].isMe=true,a=>{a.people[0].paid=true;a.products[0].owners[0]=null;}];
  for(const mutate of mutations){const a=JSON.parse(JSON.stringify(valid));mutate(a);assert.equal(api.validAccount(a),false);}
  assert.equal(api.parseDecimal('64.09',9999999),6409);assert.equal(api.parseDecimal('0',9999999),0);
  for(const input of ['-1','NaN','1.234','','1e6','100000.00'])assert.equal(api.parseDecimal(input,9999999),null);
  const empty=api.freshAccount();empty.people=[];assert.equal(api.calculate(empty).ready,false);
});
test('Nombres se escapan en HTML y no se interpretan como etiquetas',()=>{
  const ui=boot();ui.node('#person-name').value='<img src=x onerror=alert(1)>';ui.fire('#add-person','submit');
  assert.ok(ui.node('#people').innerHTML.includes('&lt;img'));assert.equal(ui.node('#people').innerHTML.includes('<img'),false);
});

function importFile(ui,text) {
  ui.node('#import-file').files=[{text:async()=>text}];
  ui.node('#import-file').value='respaldo.json';
  return ui.fire('#import-file','change');
}

test('El respaldo conserva todos los datos y rechaza JSON inválido o cuentas incompatibles',()=>{
  const {api}=boot();const account=withParticipants(api,3);account.people[1].paid=true;
  const json=api.serializeAccount(account);
  assert.ok(json.includes('\n  "version": 2'));
  assert.equal(JSON.stringify(api.parseBackup(json)),JSON.stringify(account));
  assert.throws(()=>api.parseBackup('{broken'),/JSON válido/);
  for(const mutate of [a=>a.version=3,a=>a.products[0].owners[0]='unknown',a=>a.products[0].price=1.5,a=>{a.people[0].paid=true;a.products[0].owners[0]=null;}]){
    const invalid=api.freshAccount();mutate(invalid);
    assert.throws(()=>api.parseBackup(JSON.stringify(invalid)),/cuenta válida/);
    assert.throws(()=>api.serializeAccount(invalid),/no es válida/);
  }
});

test('Exportar descarga la cuenta visible aunque el guardado falle y libera la URL',async()=>{
  const ui=boot({failWrite:true});ui.node('#person-name').value='Ana';ui.fire('#add-person','submit');
  ui.fire('#export-json','click');
  assert.equal(ui.downloads.length,1);
  assert.match(ui.downloads[0].name,/^menusplit-respaldo-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
  const exported=JSON.parse(await ui.downloads[0].blob.text());
  assert.equal(exported.people[1].name,'Ana');assert.equal(ui.store.has(KEY),false);
  assert.deepEqual(ui.revoked,['blob:test']);
});

test('Importar reemplaza una cuenta con pagos, restaura pagos y persiste al recargar',async()=>{
  const initial=boot();const old=withParticipants(initial.api,2);old.people[0].paid=true;
  const ui=boot({saved:JSON.stringify(old)});
  const restored=withParticipants(ui.api,3);restored.people[1].name='<b>Ana</b>';restored.people[1].paid=true;
  restored.taxRate=750;restored.tipRate=500;restored.products[0].note='Nota del respaldo';
  ui.node('#search').value='sin resultados';ui.fire('#search','input');
  ui.node('#edit-products').checked=true;ui.fire('#edit-products','change');
  ui.node('#person-name').value='Borrador';
  let confirmations=0;ui.confirm(message=>{assert.match(message,/reemplazarán/);confirmations++;return true;});
  await importFile(ui,JSON.stringify(restored));
  assert.equal(confirmations,1);assert.deepEqual(ui.account(),JSON.parse(JSON.stringify(restored)));
  assert.equal(ui.node('#search').value,'');assert.equal(ui.node('#edit-products').checked,false);assert.equal(ui.node('#person-name').value,'');
  assert.ok(ui.node('#people').innerHTML.includes('&lt;b&gt;Ana&lt;/b&gt;'));
  assert.equal(ui.node('#tax-rate').disabled,true);assert.equal(ui.node('#import-json').disabled,false);
  const reloaded=boot({saved:ui.store.get(KEY)});
  assert.equal(reloaded.node('#assignment-caption').textContent,'44 de 44 unidades asignadas');
  assert.equal(reloaded.node('#covered-total').textContent,ui.node('#covered-total').textContent);
  await importFile(ui,JSON.stringify(restored));assert.equal(confirmations,2);
  assert.equal(ui.node('#import-file').value,'');
});

test('Cancelar, archivos inválidos y fallos de lectura o guardado conservan la cuenta',async()=>{
  const initial=boot();const saved=JSON.stringify(initial.api.freshAccount());
  const ui=boot({saved});const restored=withParticipants(ui.api,2);
  const before=ui.node('#people').innerHTML;
  ui.confirm(()=>false);await importFile(ui,JSON.stringify(restored));
  assert.match(ui.node('#backup-status').textContent,/cancelada/);
  ui.confirm(()=>{assert.fail('No debe confirmar un archivo inválido');});
  for(const text of ['{broken','null','{"version":2}'])await importFile(ui,text);
  ui.node('#import-file').files=[{text:async()=>{throw Error('Read failed');}}];
  await ui.fire('#import-file','change');
  assert.match(ui.node('#backup-status').textContent,/leer el archivo/);
  assert.equal(ui.node('#storage-error').hidden,true);
  assert.equal(ui.store.get(KEY),saved);assert.equal(ui.node('#people').innerHTML,before);
  const quota=boot({saved,failWrite:true});await importFile(quota,JSON.stringify(restored));
  assert.equal(quota.store.get(KEY),saved);assert.equal(quota.node('#people').innerHTML,before);
  assert.match(quota.node('#backup-status').textContent,/No se pudo guardar/);
  assert.equal(quota.node('#import-json').disabled,false);
  const denied=boot({saved,failRead:true});await importFile(denied,JSON.stringify(restored));
  assert.equal(denied.store.get(KEY),saved);assert.match(denied.node('#backup-status').textContent,/comprobar/);
  await ui.fire('#import-file','change',{files:[],value:''});
  assert.equal(ui.store.get(KEY),saved);
});

test('Importar preserva almacenamiento dañado hasta restablecer y respeta conflictos',async()=>{
  const bad=boot({saved:'{broken'});const json=JSON.stringify(bad.api.freshAccount());
  await importFile(bad,json);assert.equal(bad.store.get(KEY),'{broken');
  assert.match(bad.node('#backup-status').textContent,/Restablece/);
  bad.fire('#reset','click');await importFile(bad,json);assert.equal(bad.store.get(KEY),json);
  const ui=boot({saved:json});ui.confirm(()=>false);
  ui.listeners.storage({key:KEY,newValue:'other'});
  await importFile(ui,json);assert.equal(ui.store.get(KEY),json);
  assert.match(ui.node('#backup-status').textContent,/otra pestaña/);
});

test('La lectura pendiente bloquea otra importación y detecta cambios entre pestañas',async()=>{
  const ui=boot();const original=JSON.stringify(ui.api.freshAccount());ui.store.set(KEY,original);
  let finish;
  ui.node('#import-file').files=[{text:()=>new Promise(resolve=>{finish=resolve;})}];
  const pending=ui.fire('#import-file','change');
  assert.equal(ui.node('#import-json').disabled,true);
  await importFile(ui,JSON.stringify(withParticipants(ui.api,2)));
  assert.equal(ui.store.get(KEY),original);
  const other=JSON.stringify(withParticipants(ui.api,3));ui.store.set(KEY,other);
  finish(original);await pending;
  assert.equal(ui.store.get(KEY),other);
  assert.equal(ui.node('#people-count').textContent,'1');
  assert.match(ui.node('#backup-status').textContent,/otra pestaña/);
  assert.equal(ui.node('#import-json').disabled,false);
});


test('Consumos 20/80 pagan los mismos porcentajes de IVA y propina',()=>{
  const {api}=boot();const account=withParticipants(api,2);
  account.products=[{id:'a',name:'A',price:2000,note:'',owners:['person-0']},{id:'b',name:'B',price:8000,note:'',owners:['person-1']}];
  const c=api.calculate(account);
  assert.deepEqual(Array.from(c.people,p=>[p.tax,p.tip,p.total]),[[300,200,2500],[1200,800,10000]]);
});

test('Redondeo prioriza el mayor residuo, desempata por orden y admite montos grandes',()=>{
  const {api}=boot();
  assert.deepEqual(Array.from(api.splitProportionally(2,[1,2,3,0])),[0,1,1,0]);
  assert.deepEqual(Array.from(api.splitProportionally(2,[1,1,1])),[1,1,0]);
  assert.deepEqual(Array.from(api.splitProportionally(0,[10,20])),[0,0]);
  assert.deepEqual(Array.from(api.splitProportionally(0,[0,0])),[0,0]);
  const weights=[99999990000,99999989999,1],amount=199999980000;
  const result=api.splitProportionally(amount,weights);
  assert.equal(result.reduce((sum,n)=>sum+n,0),amount);
  assert.deepEqual(Array.from(result),weights);
});

test('El consumo sin asignar reserva sus cargos y bloquea pagos hasta completar unidades gratuitas',()=>{
  const {api}=boot();const account=withParticipants(api,2);
  account.products=[{id:'a',name:'A',price:2000,note:'',owners:['person-0']},{id:'b',name:'B',price:8000,note:'',owners:[null]}];
  let c=api.calculate(account);
  assert.equal(c.people[0].tax,300);assert.equal(c.people[0].tip,200);
  assert.equal(c.people[1].total,0);assert.equal(c.unassigned,8000);assert.equal(c.ready,false);
  const ui=boot({saved:JSON.stringify(account)});
  ui.fire('#payments','change',{dataset:{payment:'person-0'},checked:true,matches:()=>true});
  assert.equal(ui.account().people[0].paid,false);
  account.products.forEach(p=>p.price=0);
  c=api.calculate(account);assert.equal(c.total,0);assert.equal(c.ready,false);
  account.products[1].owners[0]='person-1';
  c=api.calculate(account);assert.equal(c.ready,true);
  assert.ok(c.people.every(p=>p.tax===0&&p.tip===0&&p.total===0));
  account.products[0].price=100;account.taxRate=0;account.tipRate=0;
  c=api.calculate(account);assert.equal(c.tax,0);assert.equal(c.tip,0);assert.equal(c.total,100);
});

test('Las cuentas antiguas se validan y migran una vez sin perder consumos ni conservar pagos',()=>{
  const {api}=boot();const legacy=withParticipants(api,3);legacy.version=1;legacy.people[1].paid=true;
  const saved=JSON.stringify(legacy),ui=boot({saved});
  assert.equal(ui.account().version,2);assert.ok(ui.account().people.every(p=>!p.paid));
  assert.deepEqual(ui.account().products,JSON.parse(saved).products);
  assert.equal(ui.account().taxRate,legacy.taxRate);assert.equal(ui.account().tipRate,legacy.tipRate);
  assert.match(ui.node('#backup-status').textContent,/pagos anteriores se desmarcaron/);
  assert.equal(ui.node('#tax-rate').disabled,false);
  ui.fire('#payments','change',{dataset:{payment:'person-1'},checked:true,matches:()=>true});
  const reload=boot({saved:ui.store.get(KEY)});
  assert.equal(reload.account().people[1].paid,true);assert.equal(reload.node('#tax-rate').disabled,true);
  assert.equal(reload.node('#backup-status').textContent,'');
  const denied=boot({saved,failWrite:true});
  assert.equal(denied.store.get(KEY),saved);assert.equal(denied.node('#storage-error').hidden,false);
  assert.equal(denied.node('#tax-rate').disabled,false);
  assert.equal(api.parseBackup(saved).version,2);assert.equal(legacy.people[1].paid,true);
  assert.equal(JSON.parse(api.serializeAccount(legacy)).people[1].paid,false);
  legacy.products[0].owners[0]=null;
  assert.throws(()=>api.parseBackup(JSON.stringify(legacy)),/cuenta válida/);
  const damaged=JSON.stringify(legacy),bad=boot({saved:damaged});
  assert.equal(bad.node('#storage-error').hidden,false);assert.equal(bad.store.get(KEY),damaged);
});

test('Importar versión 1 explica el cambio y limpia pagos; cancelar conserva la cuenta',async()=>{
  const {api}=boot();const legacy=withParticipants(api,2);legacy.version=1;legacy.people[1].paid=true;
  const ui=boot();let confirmations=0;
  ui.confirm(message=>{assert.match(message,/pagos anteriores se desmarcaron/);confirmations++;return false;});
  await importFile(ui,JSON.stringify(legacy));assert.equal(ui.store.has(KEY),false);
  ui.confirm(()=>true);await importFile(ui,JSON.stringify(legacy));
  assert.equal(confirmations,1);assert.equal(ui.account().version,2);
  assert.ok(ui.account().people.every(p=>!p.paid));
  assert.match(ui.node('#backup-status').textContent,/pagos anteriores se desmarcaron/);
  assert.deepEqual(ui.account().products,JSON.parse(JSON.stringify(legacy.products)));
});
