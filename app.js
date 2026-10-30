/* All stored amounts are integer cents; percentages are integer hundredths. */
(() => {
  'use strict';
  const STORAGE_KEY = 'menusplit.account.v1';
  const SEED = [
    ['Hummus',2,18400],['Té caliente',1,5500],['TacosFrijolP',1,12900],
    ['Croquetas P',1,11000],['QuesoHamburguesa',1,45000,'Papas Crispy incluidas'],
    ['Té helado',2,6500],['E. César',1,36000],['Limonada',1,8000],
    ['FiletitosPollos',1,19500],['Jugo de melón',2,6409],['PolloLight',3,35000],
    ['Canada Dry Ginger Ale',1,5500],['Pulled Pork',1,37000],
    ['Limonada HierbaBuena',1,10000],['SteakFrites',1,61500],['Jamaica',1,4600],
    ['E. Asia con PolloAsia',1,35000],['SopaTomate.G',1,18400],
    ['S.B. Club de Pollo',1,36000],['Canada Dry Soda',1,5500],['Chelada',1,1837],
    ['E. Zacatelimón',1,51500],['Fresa-Naranja',1,17500],['JugoNaranja.G',1,12000],
    ['Limonada Hierbabuena Frozen',1,11000],['Filetes de Pollo',1,33000],
    ['Batido Verde Tropical',2,13000],['Ext. Pan pita',1,2747],
    ['Salmón a la Parrilla',1,66500],['Crispy Chicken Burger',1,38000,'Papas Crispy incluidas'],
    ['Batido Agua',2,7324],['Empaque Postres',1,1648],['Cumpleañero Z1',1,0],
    ['Empaque Vaso Frío 16 oz',1,549],['Americano.P',3,7500]
  ];
  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const freshAccount = () => ({version:2,taxRate:1500,tipRate:1000,
    people:[{id:'me',name:'Yo',isMe:true,paid:false}],
    products:SEED.map((r,i)=>({id:`original-${i}`,name:r[0],price:r[2],note:r[3]||'',owners:Array(r[1]).fill(null)}))});
  const split = (amount,count) => Array.from({length:count},(_,i)=>Math.floor(amount/count)+(i<amount%count?1:0));
  // BigInt keeps weighted products exact even at the maximum validated account size.
  function splitProportionally(amount,weights) {
    const total=weights.reduce((sum,weight)=>sum+BigInt(weight),0n);
    if(total===0n)return weights.map(()=>0);
    const shares=weights.map((weight,index)=>{
      const numerator=BigInt(amount)*BigInt(weight);
      return {index,amount:Number(numerator/total),remainder:numerator%total};
    });
    let leftover=amount-shares.reduce((sum,share)=>sum+share.amount,0);
    const ranked=[...shares].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
    for(const share of ranked){
      if(leftover===0)break;
      share.amount++;leftover--;
    }
    return shares.map(share=>share.amount);
  }
  const migrateAccount = account => account.version===1
    ? {...account,version:2,people:account.people.map(person=>({...person,paid:false}))}
    : account;
  const MIGRATION_NOTICE = 'La cuenta ahora reparte IVA y propina según el consumo. Los pagos anteriores se desmarcaron; revisa los nuevos importes antes de volver a marcarlos.';
  function calculate(account) {
    let subtotal=0, unassigned=0, assignedUnits=0, totalUnits=0;
    const consumption = new Map(account.people.map(p=>[p.id,0]));
    for(const product of account.products) for(const owner of product.owners) {
      subtotal+=product.price; totalUnits++;
      if(consumption.has(owner)){consumption.set(owner,consumption.get(owner)+product.price);assignedUnits++;}
      else unassigned+=product.price;
    }
    const tax=Math.round(subtotal*account.taxRate/10000);
    const tip=Math.round(subtotal*account.tipRate/10000);
    const weights=[...consumption.values(),unassigned];
    const taxes=splitProportionally(tax,weights), tips=splitProportionally(tip,weights);
    const people=account.people.map((p,i)=>({...p,consumption:consumption.get(p.id),tax:taxes[i],tip:tips[i],total:consumption.get(p.id)+taxes[i]+tips[i]}));
    const received=people.filter(p=>!p.isMe&&p.paid).reduce((s,p)=>s+p.total,0);
    const ownCovered=people.filter(p=>p.isMe&&p.paid).reduce((s,p)=>s+p.total,0);
    const collect=people.filter(p=>!p.isMe&&!p.paid).reduce((s,p)=>s+p.total,0);
    const total=subtotal+tax+tip;
    return {subtotal,tax,tip,total,unassigned,assignedUnits,totalUnits,people,received,ownCovered,collect,covered:received+ownCovered,pending:total-received-ownCovered,ready:people.length>0&&totalUnits>0&&assignedUnits===totalUnits};
  }
  const integer = (n,min,max) => Number.isSafeInteger(n)&&n>=min&&n<=max;
  function validAccount(a) {
    if(!a||![1,2].includes(a.version)||!integer(a.taxRate,0,10000)||!integer(a.tipRate,0,10000)||!Array.isArray(a.people)||!Array.isArray(a.products)||a.people.length<1||a.people.length>200||a.products.length>200)return false;
    const validString=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
    if(!a.people.every(p=>p&&validString(p.id,100)&&validString(p.name,60)&&typeof p.isMe==='boolean'&&typeof p.paid==='boolean'))return false;
    const peopleIds=new Set(a.people.map(p=>p.id));
    if(peopleIds.size!==a.people.length||a.people.filter(p=>p.isMe).length!==1)return false;
    if(!a.products.every(p=>p&&validString(p.id,100)&&validString(p.name,100)&&integer(p.price,0,9999999)&&typeof p.note==='string'&&p.note.length<=200&&Array.isArray(p.owners)&&p.owners.length>=1&&p.owners.length<=100&&p.owners.every(o=>o===null||peopleIds.has(o))))return false;
    if(new Set(a.products.map(p=>p.id)).size!==a.products.length)return false;
    return !a.people.some(p=>p.paid)||calculate(a).ready;
  }
  function parseDecimal(value,max) {
    const text=String(value).trim();
    if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
    const [whole,fraction='']=text.split('.');
    const n=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    return integer(n,0,max)?n:null;
  }
  function serializeAccount(value) {
    if(!validAccount(value))throw new Error('La cuenta no es válida para exportar.');
    return JSON.stringify(migrateAccount(value),null,2);
  }
  function parseBackup(text) {
    let value;
    try { value=JSON.parse(text); }
    catch { throw new Error('El archivo no contiene JSON válido.'); }
    if(!validAccount(value))throw new Error('El archivo no contiene una cuenta válida de MenuSplit (versiones 1 y 2).');
    return migrateAccount(value);
  }
  const money=cents=>`C$${(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  function participantProducts(value,personId) {
    return value.products.map(product=>({...product,count:product.owners.filter(owner=>owner===personId).length})).filter(product=>product.count);
  }
  function buildWhatsAppMessage(value,selectedIds) {
    const calc=calculate(value);
    const people=calc.people.filter(person=>selectedIds.includes(person.id));
    if(!calc.ready||!people.length)return '';
    // Keep user-entered labels on one line and outside WhatsApp formatting markers.
    const label=text=>String(text).replace(/[\r\n\t]+/g,' ').replace(/[*_~`]/g,character=>({'*':'＊','_':'＿','~':'～','`':'｀'}[character]));
    const details=people.map(person=>{
      const products=participantProducts(value,person.id);
      const lines=products.map(product=>`- ${product.count} × ${label(product.name)} (${money(product.price)} c/u): ${money(product.price*product.count)}${product.note?` — ${label(product.note)}`:''}`);
      return [
        `*${label(person.name)}*`,
        ...(lines.length?lines:['Sin consumos asignados.']),
        `Consumo: ${money(person.consumption)}`,
        `IVA: ${money(person.tax)}`,
        `Propina: ${money(person.tip)}`,
        `*Total a pagar: ${money(person.total)}*`
      ].join('\n');
    });
    return ['buenos dias, comparto detalle de consumo:',...details,'Datos para transferencia:\nBAC: 371640855\nA nombre de: Kenneth David Gaitan Evanks\nMoneda: córdobas (C$).'].join('\n\n');
  }
  // Expose only pure helpers for the standalone checks.
  globalThis.MenuSplit={freshAccount,calculate,validAccount,parseDecimal,split,splitProportionally,serializeAccount,parseBackup,buildWhatsAppMessage};
  if(typeof document==='undefined')return;
  const $=selector=>document.querySelector(selector);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numberValue=cents=>(cents/100).toFixed(2);
  let account=freshAccount(), editProducts=false, search='', onlyUnassigned=false, corruptStorage=false, storageUnavailable=false, storageConflict=false, importing=false, migrated=false;
  try {
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved!==null){
      const parsed=JSON.parse(saved);
      if(!validAccount(parsed))throw new Error('Invalid saved account');
      migrated=parsed.version===1;account=migrateAccount(parsed);
      if(migrated)localStorage.setItem(STORAGE_KEY,JSON.stringify(account));
    }
  } catch(error) {
    if(error instanceof SyntaxError||error.message==='Invalid saved account')corruptStorage=true;
    else storageUnavailable=true;
  }
  function storageNotice() {
    const error=$('#storage-error');
    error.hidden=!(corruptStorage||storageUnavailable||storageConflict);
    error.textContent=storageConflict?'La cuenta cambió en otra pestaña. Esta sesión no se guardará para evitar sobrescribirla. Recarga para abrir la cuenta guardada o restablece la factura para empezar de nuevo.':corruptStorage?'Los datos guardados están dañados. Puedes revisar la factura original, pero no se sobrescribirá lo guardado. Usa “Restablecer factura original” para empezar de nuevo.':storageUnavailable?'Los cambios no se están guardando. El navegador no permite guardar datos o no tiene espacio. Mantén esta pestaña abierta para conservar la sesión.':'';
    $('#save-status').textContent=storageConflict?'Cambios en otra pestaña':corruptStorage?'Datos guardados dañados':storageUnavailable?'Sin guardado local':'Guardado en este navegador';
  }
  function persist() {
    if(corruptStorage||storageConflict){storageNotice();return;}
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(account));storageUnavailable=false;}
    catch{storageUnavailable=true;}
    storageNotice();
  }
  const locked=()=>account.people.some(p=>p.paid);
  function announce(message){$('#announcement').textContent=message;}
  function commit(message){
    const active=document.activeElement;
    let focusSelector;
    if(active?.dataset.payment)focusSelector=`[data-payment="${CSS.escape(active.dataset.payment)}"]`;
    else if(active?.matches('[data-unit], [data-field]')){
      const productId=active.closest('[data-product]').dataset.product;
      const key=active.dataset.unit!==undefined?'unit':'field';
      focusSelector=`[data-product="${CSS.escape(productId)}"] [data-${key}="${CSS.escape(active.dataset[key])}"]`;
    }
    persist();render();
    if(focusSelector){
      const target=$(focusSelector);
      if(target)target.focus({preventScroll:true});
      else if(onlyUnassigned&&active?.matches('[data-unit]'))$('#only-unassigned').focus({preventScroll:true});
    }
    if(message)announce(message);
  }
  function renderProducts() {
    const isLocked=locked();
    const options=account.people.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}${p.isMe?' (yo)':''}</option>`).join('');
    const filtered=account.products.filter(p=>(!onlyUnassigned||p.owners.includes(null))&&`${p.name} ${p.note}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()));
    $('#products').innerHTML=filtered.map(p=>`<article class="product" data-product="${escape(p.id)}"><div class="product-head"><strong>${escape(p.name)}</strong><span>${money(p.price*p.owners.length)}</span></div><div class="product-note">${p.owners.length} × ${money(p.price)}${p.note?` · ${escape(p.note)}`:''}</div>${editProducts?`<div class="product-editor"><label>Producto<input data-field="name" aria-label="Nombre de ${escape(p.name)}" value="${escape(p.name)}" maxlength="100" ${isLocked?'disabled':''}></label><label>Cantidad<input data-field="quantity" aria-label="Cantidad de ${escape(p.name)}" type="number" min="1" max="100" step="1" value="${p.owners.length}" ${isLocked?'disabled':''}></label><label>Precio unitario<input data-field="price" aria-label="Precio de ${escape(p.name)}" type="number" min="0" max="99999.99" step="0.01" value="${numberValue(p.price)}" ${isLocked?'disabled':''}></label></div><button class="text-button" data-action="delete-product" ${isLocked?'disabled':''}>Eliminar producto</button>`:''}${p.owners.map((owner,i)=>`<div class="unit"><span class="unit-label">Unidad ${i+1}</span><select class="${owner?'assigned':'unassigned'}" data-unit="${i}" aria-label="Asignar ${escape(p.name)}, unidad ${i+1}" ${isLocked?'disabled':''}><option value="">Sin asignar</option>${options}</select></div>`).join('')}</article>`).join('')||`<p class="empty">${onlyUnassigned?(search?'No hay productos con unidades sin asignar que coincidan con la búsqueda.':'No quedan productos con unidades sin asignar.'):'No hay productos que coincidan con la búsqueda.'}</p>`;
    for(const article of $('#products').querySelectorAll('[data-product]')){
      const product=account.products.find(p=>p.id===article.dataset.product);
      for(const select of article.querySelectorAll('[data-unit]'))select.value=product.owners[Number(select.dataset.unit)]||'';
    }
    $('#add-product').hidden=!editProducts;$('#add-product').disabled=isLocked||account.products.length>=200;
  }
  function render() {
    const calc=calculate(account), isLocked=locked();
    $('#grand-total').textContent=money(calc.total);
    $('#bill-summary').textContent=`Consumos ${money(calc.subtotal)} + IVA + propina`;
    $('#covered-total').textContent=money(calc.covered);
    $('#covered-caption').textContent=`${account.people.filter(p=>p.paid).length} de ${account.people.length} partes cubiertas`;
    $('#pending-total').textContent=money(calc.pending);
    $('#unit-count').textContent=`${calc.totalUnits} unidades`;
    $('#people-count').textContent=String(account.people.length);
    $('#lock-notice').hidden=!isLocked;
    $('#tax-rate').value=numberValue(account.taxRate);$('#tip-rate').value=numberValue(account.tipRate);
    $('#tax-rate').disabled=isLocked;$('#tip-rate').disabled=isLocked;
    $('#bill-totals').innerHTML=[['Subtotal',calc.subtotal],[`IVA (${numberValue(account.taxRate)}%)`,calc.tax],[`Propina (${numberValue(account.tipRate)}%)`,calc.tip],['Total',calc.total]].map(([label,value])=>`<div><span>${label}</span><span>${money(value)}</span></div>`).join('');
    $('#assignment-caption').textContent=`${calc.assignedUnits} de ${calc.totalUnits} unidades asignadas`;
    $('#unassigned-total').textContent=`Sin asignar: ${money(calc.unassigned)}`;
    $('#assignment-progress').max=calc.totalUnits||1;$('#assignment-progress').value=calc.assignedUnits;
    $('#person-name').disabled=isLocked||account.people.length>=200;
    $('#add-person button').disabled=isLocked||account.people.length>=200;
    renderProducts();
    $('#people').innerHTML=calc.people.map(person=>{
      const products=participantProducts(account,person.id);
      return `<article class="person" data-person="${escape(person.id)}"><div class="person-heading"><div class="person-identity"><span class="avatar" aria-hidden="true">${escape(person.name.slice(0,1).toUpperCase())}</span><strong class="person-name">${escape(person.name)}${person.isMe?'<span class="own-label">Tu parte</span>':''}</strong></div><div class="person-total-wrapper"><span class="person-total-label">Total a pagar</span><strong class="person-total">${money(person.total)}</strong></div></div><div class="person-actions"><button class="text-button" data-action="rename-person" ${isLocked?'disabled':''}>Cambiar nombre</button>${person.isMe?'':`<button class="text-button" data-action="delete-person" ${isLocked?'disabled':''}>Eliminar</button>`}</div>${products.length?`<ul class="consumption">${products.map(p=>`<li><span>${p.count} × ${escape(p.name)}</span><span>${money(p.price*p.count)}</span></li>`).join('')}</ul>`:'<p class="empty">Sin consumos asignados. Puedes elegirlos en la factura.</p>'}<div class="person-breakdown"><span>Consumo <strong>${money(person.consumption)}</strong></span><span>IVA <strong>${money(person.tax)}</strong></span><span>Propina <strong>${money(person.tip)}</strong></span></div></article>`;
    }).join('');
    const peopleTotal=calc.people.reduce((sum,person)=>sum+person.total,0);
    const difference=calc.total-peopleTotal;
    $('#people-grand-total').textContent=money(peopleTotal);
    $('#people-bill-total').textContent=money(calc.total);
    $('#people-total-difference').textContent=money(difference);
    $('#people-total-status').textContent=!calc.ready?'Importes provisionales: asigna todas las unidades para comprobar el total.':difference===0?'El gran total de participantes coincide con la factura.':'El gran total de participantes no coincide con la factura. Revisa los importes.';
    $('#people-total-status').classList.toggle('totals-match',calc.ready&&difference===0);
    $('#share').disabled=!calc.ready;
    $('#share-hint').textContent=calc.ready?'Comparte el detalle de los participantes que elijas en un mensaje de WhatsApp.':'Asigna todas las unidades para compartir los importes definitivos por WhatsApp.';
    $('#received-total').textContent=money(calc.received);$('#own-covered').textContent=money(calc.ownCovered);$('#collect-total').textContent=money(calc.collect);
    $('#payment-instruction').textContent=calc.ready?'IVA y propina se reparten según el consumo de cada persona, antes de cargos. Los centavos restantes se asignan al mayor residuo; en empate, por orden de participantes.':`Asigna todos los productos para registrar pagos. Los importes por persona son provisionales${calc.totalUnits?'':'; agrega al menos un producto'}.`;
    $('#payments').innerHTML=calc.people.map(p=>`<div class="payment-row ${p.paid?'is-paid':''}"><div><strong>${escape(p.name)}${p.isMe?' (yo)':''}</strong><small>${money(p.total)}${p.paid?' · Cubierto':''}</small></div><label><input type="checkbox" data-payment="${escape(p.id)}" ${p.paid?'checked':''} ${calc.ready?'':'disabled'}>${p.isMe?'Mi parte cubierta':'Pagado'}</label></div>`).join('');
    const pending=calc.people.filter(p=>!p.paid&&!p.isMe);
    $('#pending-names').textContent=calc.ready?(pending.length?`Faltan por pagar: ${pending.map(p=>p.name).join(', ')}.`:calc.pending===0?'La cuenta está completamente cubierta.':'Los demás ya pagaron. Falta cubrir tu parte.'):'El pendiente por cobrar será definitivo al terminar las asignaciones.';
    storageNotice();
  }
  const shareDialog=$('#share-dialog');
  function clearShareResult() {
    $('#share-status').textContent='';
    $('#share-retry').hidden=true;
    $('#share-retry').removeAttribute('href');
  }
  $('#share').addEventListener('click',()=>{
    const calc=calculate(account);
    if(!calc.ready)return;
    $('#share-people').innerHTML=calc.people.map(person=>`<label class="share-person"><input type="checkbox" name="participant" value="${escape(person.id)}"><span class="share-person-info">${escape(person.name)}${person.isMe?' (yo)':''}${person.paid?'<small>Pago cubierto</small>':''}</span><span class="share-person-total">${money(person.total)}</span></label>`).join('');
    $('#share-send').disabled=true;
    $('#share-selection-count').textContent='Selecciona al menos un participante.';
    clearShareResult();
    shareDialog.showModal();
    $('#share-people input').focus();
  });
  $('#share-people').addEventListener('change',()=>{
    const count=$('#share-people').querySelectorAll('input:checked').length;
    $('#share-send').disabled=count===0;
    $('#share-selection-count').textContent=count===0?'Selecciona al menos un participante.':`${count} participante${count===1?' seleccionado':'s seleccionados'}`;
    clearShareResult();
  });
  $('#share-cancel').addEventListener('click',()=>shareDialog.close());
  shareDialog.addEventListener('close',()=>{
    clearShareResult();
    $('#share').focus({preventScroll:true});
  });
  $('#share-form').addEventListener('submit',event=>{
    event.preventDefault();
    const selectedIds=Array.from($('#share-people').querySelectorAll('input:checked'),input=>input.value);
    const message=buildWhatsAppMessage(account,selectedIds);
    if(!message){
      $('#share-status').textContent='Completa las asignaciones y selecciona al menos un participante para compartir.';
      return;
    }
    const url=`https://wa.me/?text=${encodeURIComponent(message)}`;
    const retry=$('#share-retry');
    retry.href=url;retry.hidden=false;
    let popup;
    try {
      popup=window.open('about:blank','_blank');
      if(popup){popup.opener=null;popup.location.href=url;}
    } catch {
      popup?.close();popup=null;
    }
    $('#share-status').textContent=popup?'Se abrió WhatsApp con el mensaje preparado. Elige el chat o grupo y confirma el envío allí. Si no se abre, usa el enlace.':'El navegador bloqueó la apertura de WhatsApp. Usa el enlace para abrir el mensaje y confirmar el envío allí.';
  });
  $('#search').addEventListener('input',event=>{search=event.target.value;renderProducts();});
  $('#only-unassigned').addEventListener('change',event=>{onlyUnassigned=event.target.checked;renderProducts();});
  $('#edit-products').addEventListener('change',event=>{editProducts=event.target.checked;renderProducts();});
  $('#add-person').addEventListener('submit',event=>{
    event.preventDefault();if(locked()||account.people.length>=200)return;
    const input=$('#person-name'), name=input.value.trim();
    if(!name){input.setCustomValidity('Escribe un nombre.');input.reportValidity();return;}
    account.people.push({id:id(),name,isMe:false,paid:false});input.value='';commit('Participante agregado.');input.focus();
  });
  $('#person-name').addEventListener('input',event=>event.target.setCustomValidity(''));
  for(const [selector,field] of [['#tax-rate','taxRate'],['#tip-rate','tipRate']])$(selector).addEventListener('change',event=>{
    if(locked()){render();return;}
    const value=parseDecimal(event.target.value,10000);
    if(value===null){alert('Usa un porcentaje entre 0 y 100, con hasta dos decimales.');render();return;}
    account[field]=value;commit('Cargos actualizados.');
  });
  $('#products').addEventListener('change',event=>{
    const input=event.target, article=input.closest('[data-product]');if(!article)return;
    if(locked()){render();return;}
    const product=account.products.find(p=>p.id===article.dataset.product);if(!product)return;
    if(input.matches('[data-unit]')){
      if(input.value&&!account.people.some(p=>p.id===input.value))return;
      product.owners[Number(input.dataset.unit)]=input.value||null;
    }else if(input.dataset.field==='name'){
      if(!input.value.trim()){alert('El producto necesita un nombre.');render();return;}product.name=input.value.trim().slice(0,100);
    }else if(input.dataset.field==='price'){
      const value=parseDecimal(input.value,9999999);if(value===null){alert('Usa un precio entre 0 y 99,999.99, con hasta dos decimales.');render();return;}product.price=value;
    }else if(input.dataset.field==='quantity'){
      const quantity=Number(input.value);if(!integer(quantity,1,100)){alert('La cantidad debe ser un entero entre 1 y 100.');render();return;}
      if(quantity<product.owners.length&&product.owners.slice(quantity).some(Boolean)&&!confirm('Se quitarán las últimas unidades y sus asignaciones. ¿Continuar?')){render();return;}
      product.owners=Array.from({length:quantity},(_,i)=>product.owners[i]||null);
    }else return;
    commit('Factura actualizada.');
  });
  $('#products').addEventListener('click',event=>{
    const button=event.target.closest('[data-action="delete-product"]');if(!button||locked())return;
    const product=account.products.find(p=>p.id===button.closest('[data-product]').dataset.product);
    if(confirm(`¿Eliminar ${product.name} y sus asignaciones?`)){account.products=account.products.filter(p=>p.id!==product.id);commit('Producto eliminado.');}
  });
  $('#add-product').addEventListener('click',()=>{
    if(locked()||account.products.length>=200)return;
    account.products.push({id:id(),name:'Nuevo producto',price:0,note:'',owners:[null]});search='';$('#search').value='';commit('Producto agregado. Edita su nombre y precio.');
    const last=$('#products').lastElementChild;last.scrollIntoView({block:'center'});last.querySelector('[data-field="name"]').focus();
  });
  $('#people').addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button||locked())return;
    const person=account.people.find(p=>p.id===button.closest('[data-person]').dataset.person);
    if(button.dataset.action==='rename-person'){
      const name=prompt('Nombre del participante:',person.name);if(name===null)return;
      if(!name.trim()||name.trim().length>60){alert('Usa un nombre de 1 a 60 caracteres.');return;}person.name=name.trim();commit('Nombre actualizado.');
    }else if(!person.isMe&&confirm(`¿Eliminar a ${person.name}? Sus productos quedarán sin asignar.`)){
      account.people=account.people.filter(p=>p.id!==person.id);
      for(const product of account.products)product.owners=product.owners.map(owner=>owner===person.id?null:owner);
      commit('Participante eliminado. Sus consumos quedaron sin asignar.');
    }
  });
  $('#payments').addEventListener('change',event=>{
    if(!event.target.matches('[data-payment]'))return;
    if(!calculate(account).ready){render();return;}
    const person=account.people.find(p=>p.id===event.target.dataset.payment);person.paid=event.target.checked;
    commit(person.paid?'Pago registrado.':'Pago desmarcado.');
  });
  function backupStatus(message) { $('#backup-status').textContent=message; }
  function canImport() {
    if(corruptStorage){backupStatus('Restablece la factura original antes de importar. Los datos guardados dañados se conservarán hasta entonces.');return false;}
    if(storageConflict){backupStatus('Recarga o restablece la factura antes de importar: la cuenta cambió en otra pestaña.');return false;}
    return true;
  }
  $('#export-json').addEventListener('click',()=>{
    let url, link;
    try {
      const json=serializeAccount(account);
      const now=new Date();
      const pad=n=>String(n).padStart(2,'0');
      const stamp=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      url=URL.createObjectURL(new Blob([json],{type:'application/json;charset=utf-8'}));
      link=document.createElement('a');link.href=url;link.download=`menusplit-respaldo-${stamp}.json`;
      document.body.append(link);link.click();
      backupStatus('Respaldo JSON generado con la cuenta visible.');
    } catch { backupStatus('No se pudo exportar la cuenta. Inténtalo de nuevo.'); }
    finally {
      link?.remove();
      if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  });
  $('#import-json').addEventListener('click',()=>{
    if(!importing&&canImport())$('#import-file').click();
  });
  $('#import-file').addEventListener('change',async event=>{
    const input=event.target, file=input.files?.[0];
    input.value='';
    if(!file||importing||!canImport())return;
    importing=true;$('#import-json').disabled=true;
    backupStatus('Leyendo respaldo JSON…');
    let failure='No se pudo comprobar la cuenta guardada. No se importaron datos.';
    try {
      const savedBefore=localStorage.getItem(STORAGE_KEY);
      let text;
      try { text=await file.text(); }
      catch { backupStatus('No se pudo leer el archivo. Inténtalo de nuevo.');return; }
      let restored, legacy=false;
      try { restored=parseBackup(text);legacy=JSON.parse(text).version===1; }
      catch(error) { backupStatus(error.message);return; }
      if(!canImport())return;
      failure='No se pudo comprobar la cuenta guardada. No se importaron datos.';
      if(localStorage.getItem(STORAGE_KEY)!==savedBefore){
        storageConflict=true;storageNotice();canImport();return;
      }
      if(!confirm(`Se reemplazarán los participantes, productos, asignaciones y pagos actuales por los del archivo.${legacy?' '+MIGRATION_NOTICE:''} ¿Continuar?`)){
        backupStatus('Importación cancelada.');return;
      }
      failure='No se pudo guardar el respaldo en este navegador. La cuenta actual se conserva.';
      localStorage.setItem(STORAGE_KEY,JSON.stringify(restored));
      account=restored;storageUnavailable=false;search='';onlyUnassigned=false;editProducts=false;
      $('#search').value='';$('#only-unassigned').checked=false;$('#edit-products').checked=false;$('#person-name').value='';$('#person-name').setCustomValidity('');
      render();backupStatus(`Cuenta restaurada y guardada en este navegador.${legacy?' '+MIGRATION_NOTICE:''}`);
    } catch {
      storageUnavailable=true;storageNotice();backupStatus(failure);
    } finally {
      importing=false;$('#import-json').disabled=false;$('#import-json').focus({preventScroll:true});
    }
  });
  $('#reset').addEventListener('click',()=>{
    if(!confirm('¿Restablecer la factura original? Se borrarán todos los participantes, cambios, asignaciones y pagos de esta cuenta.'))return;
    account=freshAccount();corruptStorage=false;storageConflict=false;search='';onlyUnassigned=false;editProducts=false;$('#search').value='';$('#only-unassigned').checked=false;$('#edit-products').checked=false;$('#person-name').value='';commit('Factura original restablecida.');
  });
  // Prevent a second tab from silently overwriting this tab's account.
  addEventListener('storage',event=>{
    if(event.key!==STORAGE_KEY&&event.key!==null)return;
    if(event.newValue===JSON.stringify(account))return;
    if(confirm('La cuenta guardada cambió en otra pestaña. ¿Cargar la versión guardada? Se descartarán los cambios de esta pestaña.'))location.reload();
    else {storageConflict=true;storageNotice();}
  });
  render();
  if(migrated)backupStatus(MIGRATION_NOTICE);
})();
