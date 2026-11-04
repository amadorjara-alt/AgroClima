(function(root){
    'use strict';
    function mount({container,invoiceId,draft,onConfirm}) {
        draft=root.CompraSmartReceiptParser?.recoverReceiptDraft(draft)||draft;
        const doc=container.ownerDocument;
        container.innerHTML=`<form class="invoice-review-form">
            <p class="review-notice">El OCR puede equivocarse. Compara los datos con el archivo y confirma cada producto, presentación, marca y unidad antes de guardar.</p>
            <div class="review-fields">
              <label>Proveedor<input name="supplier_name" required maxlength="200"></label>
              <label>RUC, si aparece<input name="supplier_ruc" inputmode="numeric" pattern="[0-9]{11}" maxlength="11"></label>
              <label>Número de comprobante<input name="invoice_number" maxlength="100"></label>
              <label>Fecha<input name="issue_date" type="date" required></label>
              <label>Moneda<input name="currency" required pattern="[A-Za-z]{3}" maxlength="3" placeholder="PEN o USD"></label>
            </div>
            <p>Conserva la presentación en el nombre: «Aceite 1 L» y «Aceite 5 L» son productos diferentes. Una marca o unidad distinta también se registra por separado.</p>
            <div class="table-responsive"><table class="data-table review-items"><thead><tr><th>Producto / categoría</th><th>Cantidad</th><th>Unidad</th><th>Marca</th><th>Precio unitario</th><th>Importe de línea</th><th>Acción</th></tr></thead><tbody></tbody></table></div>
            <p class="review-notice" data-review-empty hidden>No se reconocieron los productos. Completa la primera fila con los datos del comprobante; puedes añadir más productos debajo.</p>
            <button type="button" class="secondary-button" data-review-add>Añadir producto</button>
            <div class="review-fields">
              <label>Impuesto que falta añadir a las líneas<input name="tax_amount" type="number" min="0" max="1000000000" step="0.01" required></label>
              <label>Descuento general<input name="discount_amount" type="number" min="0" max="1000000000" step="0.01" required value="0"></label>
              <label>Total del comprobante<input name="total_amount" type="number" min="0.01" max="1000000000" step="0.01" required></label>
            </div>
            <p>Si los importes de línea ya incluyen IGV, escribe 0 en el impuesto adicional. Confirma también el descuento: 0 cuando no corresponda. La suma debe coincidir con el total.</p>
            <p>El historial comparará el coste final por unidad, repartiendo proporcionalmente los impuestos adicionales y descuentos generales.</p>
            <p data-review-totals role="status" aria-live="polite"></p>
            <ul class="review-warnings"></ul>
            <div role="status" aria-live="polite" class="invoice-upload-message" data-review-message></div>
            <button type="submit" class="primary-button">Confirmar y guardar compra</button>
            <details><summary>Ver texto leído por OCR.space</summary><pre class="review-raw"></pre></details>
        </form>`;
        const form=container.querySelector('form'), rows=form.querySelector('tbody'), message=form.querySelector('[data-review-message]');
        const get=name=>form.elements.namedItem(name);
        const set=(name,value)=>{get(name).value=value??'';};
        set('supplier_name',draft.provider);set('supplier_ruc',draft.ruc);set('invoice_number',draft.number);
        set('issue_date',draft.date);set('currency',draft.currency);set('total_amount',draft.total);
        const items=Array.isArray(draft.items)?draft.items:[];
        const sum=items.reduce((n,item)=>n+(Number(item.line_amount)||0),0);
        set('tax_amount',items.length&&draft.total!=null&&Math.abs(sum-Number(draft.total))<0.02?0:draft.igv);
        function input(name,value,{type='text',required=true,maxLength=100,min,step}={}){
            const el=doc.createElement('input');el.dataset.field=name;el.type=type;el.required=required;el.maxLength=maxLength;
            el.setAttribute('aria-label',name);if(min!==undefined)el.min=String(min);if(step)el.step=String(step);el.value=value??'';return el;
        }
        function updateTotals() {
            const summary=form.querySelector('[data-review-totals]');
            const values=[...rows.querySelectorAll('[data-field=subtotal]')];
            const complete=values.length&&values.every(el=>el.value!==''&&Number.isFinite(Number(el.value)))&&['tax_amount','discount_amount','total_amount'].every(name=>get(name).value!==''&&Number.isFinite(Number(get(name).value)));
            if(!complete){summary.textContent='Completa los importes de los productos y los impuestos para comprobar la suma.';return;}
            const subtotal=values.reduce((n,el)=>n+Number(el.value),0),calculated=subtotal+Number(get('tax_amount').value)-Number(get('discount_amount').value);
            const matches=Math.abs(calculated-Number(get('total_amount').value))<=0.02;
            summary.textContent=`Productos: ${subtotal.toFixed(2)} + impuesto: ${Number(get('tax_amount').value).toFixed(2)} − descuento: ${Number(get('discount_amount').value).toFixed(2)} = ${calculated.toFixed(2)} ${get('currency').value}. ${matches?'Coincide con el total.':'Revisa la diferencia con el total del comprobante.'}`;
            summary.className=matches?'form-message success':'form-message error';
        }
        function add(item={}) {
            const tr=doc.createElement('tr');
            const fields=[input('description',item.description,{maxLength:300}),input('quantity',item.quantity,{type:'number',min:0.000001,step:'any'}),input('unit',item.unit,{maxLength:50}),input('brand',item.brand,{required:false}),input('unit_price',item.unit_price,{type:'number',min:0,step:'any'}),input('subtotal',item.line_amount??item.subtotal,{type:'number',min:0,step:'0.01'})];
            for(const el of fields){const td=doc.createElement('td');td.append(el);tr.append(td);}
            const category=input('category',item.category??'Otros',{required:false});category.placeholder='Categoría';tr.firstChild.append(category);
            const td=doc.createElement('td'),remove=doc.createElement('button');remove.type='button';remove.textContent='Quitar';remove.className='supplier-action-button';remove.addEventListener('click',()=>{tr.remove();updateTotals();});td.append(remove);tr.append(td);rows.append(tr);
            const recalculate=()=>{
                const quantity=fields[1].value,price=fields[4].value;
                if(quantity!==''&&price!==''&&Number.isFinite(Number(quantity)*Number(price)))fields[5].value=(Number(quantity)*Number(price)).toFixed(2);
            };
            fields[1].addEventListener('input',recalculate);fields[4].addEventListener('input',recalculate);
            return tr;
        }
        items.forEach(add);
        if(!items.length){add({quantity:1});form.querySelector('[data-review-empty]').hidden=false;}
        form.querySelector('[data-review-add]').addEventListener('click',()=>{if(rows.rows.length<200){add({quantity:1}).querySelector('input').focus();updateTotals();}});
        form.addEventListener('input',updateTotals);
        updateTotals();
        for(const warning of draft.warnings||[]){const li=doc.createElement('li');li.textContent=warning;form.querySelector('ul').append(li);}
        form.querySelector('pre').textContent=draft.rawText||'';
        let busy=false,confirmed=false;
        form.addEventListener('submit',async event=>{
            event.preventDefault();if(busy||confirmed)return;
            if(!form.reportValidity())return;
            message.textContent='';message.className='invoice-upload-message';
            if(!rows.rows.length){message.textContent='Añade al menos un producto y confirma sus importes.';return;}
            const data={};for(const name of ['supplier_name','supplier_ruc','invoice_number','issue_date','currency'])data[name]=get(name).value.trim();
            for(const name of ['total_amount','tax_amount','discount_amount'])data[name]=Number(get(name).value);
            data.items=Array.from(rows.rows,tr=>Object.fromEntries(Array.from(tr.querySelectorAll('[data-field]'),el=>[el.dataset.field,['quantity','unit_price','subtotal'].includes(el.dataset.field)?Number(el.value):el.value.trim()])));
            const subtotal=data.items.reduce((n,item)=>n+item.subtotal,0);
            if(data.items.some(i=>Math.abs(Math.round(i.quantity*i.unit_price*100)/100-i.subtotal)>0.02)||Math.abs(subtotal+data.tax_amount-data.discount_amount-data.total_amount)>0.02){
                message.textContent='Revisa los importes: cantidad × precio por línea, más impuesto adicional y menos descuento, deben coincidir con el total.';message.classList.add('error');return;
            }
            const button=form.querySelector('[type=submit]');busy=true;button.disabled=true;button.textContent='Guardando compra…';
            try {
                await onConfirm(invoiceId,data);confirmed=true;message.textContent='Compra guardada. Productos, proveedor y precios están en tu historial.';message.classList.add('success');
                for(const el of form.querySelectorAll('input,button'))el.disabled=true;button.textContent='Compra guardada';
            } catch(error){message.textContent=error?.message||'No se pudo guardar la compra.';message.classList.add('error');}
            finally{busy=false;if(!confirmed){button.disabled=false;button.textContent='Confirmar y guardar compra';}}
        });
        container.hidden=false;
        return form;
    }
    root.CompraSmartInvoiceReview=Object.freeze({mount});
})(globalThis);
