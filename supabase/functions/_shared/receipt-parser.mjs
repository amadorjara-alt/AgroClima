// Recuperado de OCR/script.js del ZIP del grupo. Solo funciones puras:
// no incluye acceso al navegador, claves, almacenamiento ni llamadas a Gemini.
// Se corrigen importes con coma decimal y la distinción SUB TOTAL / TOTAL.
function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[ \t]+/g, " ");
}

function isValidRUC(value) {
  const ruc = String(value || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(ruc)) return false;

  const digits = ruc.split("").map(Number);
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, weight, index) =>
    acc + weight * digits[index], 0
  );
  const remainder = 11 - (sum % 11);
  const check = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder;

  return check === digits[10];
}

function findSupplierRUC(text, normalized) {
  const labeled = [
    /\bR\.?\s*U\.?\s*C\.?\s*[:\-]?\s*(\d{11})\b/i,
    /\bRUC\s+(\d{11})\b/i
  ];

  for (const regex of labeled) {
    const matches = [...text.matchAll(new RegExp(regex.source, "gi"))];
    for (const match of matches) {
      if (isValidRUC(match[1])) return match[1];
    }
  }

  // Sin etiqueta explícita, priorizar un RUC válido en las primeras líneas.
  const earlyText = text.split(/\r?\n/).slice(0, 12).join("\n");
  const candidates = [...earlyText.matchAll(/\b(\d{11})\b/g)];
  for (const match of candidates) {
    if (isValidRUC(match[1])) return match[1];
  }

  // Fallback: algunos OCR alteran un dígito del RUC; no se inventa ni corrige.
  return null;
}

function findProvider(lines, normalized, ruc) {
  const badLine = /^(?:RUC|R\.U\.C|FACTURA|BOLETA|ELECTRONICA|ELECTRÓNICA|COMPROBANTE|DIRECCION|DIRECCIÓN|TELEFONO|TELÉFONO|FECHA|CLIENTE|ADQUIRIENTE|SUNAT|SERIE|NRO|N°|Nº|PAGINA|PÁGINA)\b/i;
  const moneyLine = /(?:S\/\.?\s*\d|TOTAL|IGV|SUBTOTAL|OP\.?\s*GRAVADA|IMPORTE|CANTIDAD|PRECIO UNITARIO)/i;
  const rucDigits = String(ruc || "").replace(/\D/g, "");

  // Intentar identificar la línea que contiene el RUC y revisar el encabezado.
  let rucLineIndex = -1;
  if (rucDigits) {
    rucLineIndex = lines.findIndex(line => line.replace(/\D/g, "").includes(rucDigits));
  }

  const topLines = lines.slice(0, Math.min(12, lines.length));
  const candidates = [];

  if (rucLineIndex >= 0) {
    candidates.push(...lines.slice(Math.max(0, rucLineIndex - 3), rucLineIndex));
  }
  candidates.push(...topLines);

  const seen = new Set();

  for (const rawLine of candidates) {
    let line = rawLine
      .replace(/\bR\.?\s*U\.?\s*C\.?\s*[:\-]?\s*\d{11}\b/ig, "")
      .replace(/\b\d{11}\b/g, "")
      .replace(/[|*_~]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const norm = normalizeText(line);
    if (!line || seen.has(norm)) continue;
    seen.add(norm);

    if (badLine.test(line) || moneyLine.test(line)) continue;
    if (line.length < 4 || line.length > 100) continue;
    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(line)) continue;
    if (/^\d+[\s./-]*$/.test(line)) continue;

    // Preferir nombres con forma de razón social o nombre comercial.
    if (/\b(SAC|S\.A\.C|SAA|S\.A\.A|SA|S\.A|EIRL|E\.I\.R\.L|SRL|S\.R\.L|SOCIEDAD|EMPRESA|COMERCIAL|SERVICIOS|INDUSTRIAS|DISTRIBUIDORA)\b/i.test(line)) {
      return line.slice(0, 100);
    }
  }

  // Si no hay razón social clara, tomar la primera línea razonable del encabezado.
  for (const rawLine of topLines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (
      line.length >= 4 &&
      line.length <= 70 &&
      /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(line) &&
      !badLine.test(line) &&
      !moneyLine.test(line) &&
      !/\b\d{11}\b/.test(line)
    ) {
      return line;
    }
  }

  return "Proveedor por identificar";
}

function findReceiptDate(text) {
  const iso = String(text).match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso && isISODate(iso[0])) return iso[0];
  const labeled = [
    /\bFECHA(?:\s+DE\s+EMISI[ÓO]N)?\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
    /\bEMITIDO\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i
  ];

  let value = null;

  for (const regex of labeled) {
    const match = text.match(regex);
    if (match) {
      value = match[1];
      break;
    }
  }

  if (!value) {
    const match = matchRule("date", text);
    value = match;
  }

  if (!value) return "";

  const parts = value.split(/[\/\-.]/).map(Number);
  if (parts.length !== 3) return "";

  let [day, month, year] = parts;
  if (year < 100) year += year < 50 ? 2000 : 1900;

  if (day < 1 || day > 31 || month < 1 || month > 12) return "";
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return "";

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findReceiptNumber(text, fileName) {
  const patterns = [
    /\b(?:FACTURA|BOLETA)\s*(?:ELECTR[ÓO]NICA)?\s*(?:N[°º.]?\s*)?([FB]\s*\d{1,4}\s*[-–]\s*\d{1,10})/i,
    /\b(?:SERIE\s*[:\-]?\s*)?([FB]\d{1,4}\s*[-–]\s*\d{1,10})\b/i,
    /\b(?:N[ÚU]MERO|NRO\.?|N[°º])\s*(?:DE\s+COMPROBANTE)?\s*[:\-]?\s*([A-Z0-9]{1,5}\s*[-/]\s*\d{1,12})\b/i
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (match) return match[1].replace(/\s+/g, "").replace("–", "-");
  }

  const ruleMatch = matchRule("invoice", text);
  if (ruleMatch) return ruleMatch.replace(/\s+/g, "").replace("–", "-");

  // No confundir el nombre del archivo con un número fiscal válido.
  return "";
}

function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseProviderJSON(text) {
  const cleaned = String(text)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function matchRule(id, text) {
  const expression = id === 'date' ? /\b(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})\b/ : /\b([FB]\d{1,4}\s*[-–]\s*\d{1,10})\b/i;
  return String(text).match(expression)?.[1] || null;
}
export function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : null;
  if (value == null || String(value).trim() === '') return null;
  let text=String(value).replace(/S\/\.?|PEN\.?|USD|US\$|\$/gi,'').replace(/\s/g,'');
  if (!/^[+-]?\d[\d,.]*$/.test(text)) return null;
  const comma=text.lastIndexOf(','), dot=text.lastIndexOf('.');
  if (comma>=0 && dot>=0) {
    const decimal=comma>dot?',':'.', grouping=decimal===','?'.':',';
    const segments=text.split(decimal);
    if (segments.length!==2 || !/^\d{1,2}$/.test(segments[1])) return null;
    text=segments[0].split(grouping).join('')+'.'+segments[1];
  } else if (comma>=0 || dot>=0) {
    const separator=comma>=0?',':'.', segments=text.split(separator), tail=segments.at(-1);
    if (segments.length===2 && /^\d{1,2}$/.test(tail)) text=segments.join('.');
    else if (segments.slice(1).every(x=>/^\d{3}$/.test(x)) && /^[+-]?\d{1,3}$/.test(segments[0])) text=segments.join('');
    else return null;
  }
  const number=Number(text);
  return Number.isFinite(number) ? round2(number) : null;
}
function labeledAmount(text, patterns) {
  const lines=String(text).split(/\r?\n/).map(line=>line.replace(/[|*#]/g,' ').trim());
  for (const pattern of patterns) {
    const expression=new RegExp('^(?:'+pattern+')\\b\\s*(?::|[-–])?\\s*','i');
    for (const line of lines) {
      const match=expression.exec(line);
      if (!match) continue;
      let rest=line.slice(match[0].length).replace(/^\(?\d+(?:[.,]\d+)?\s*%\)?\s*[:=-]?\s*/,'');
      const token=rest.match(/^(?:S\/\.?|PEN|USD|US\$|\$)?\s*([+-]?\d[\d.,]*)/i)?.[1];
      const value=parseAmount(token);
      if (value!==null) return value;
    }
  }
  return null;
}
export function extractLineItems(text) {
  const money='(?:\\d{1,3}(?:[.,]\\d{3})+|\\d+)[.,]\\d{2}';
  const prefix='(?:(?:S\\/\\.?|US\\$|\\$|PEN|USD)\\s*)?';
  const row=new RegExp('^\\s*(\\d+(?:[.,]\\d{1,3})?)\\s+(?:(un|und|unidad(?:es)?|kg|l|caja(?:s)?|saco(?:s)?|paquete(?:s)?)\\s+)?(.+?)\\s+'+prefix+'('+money+')\\s+'+prefix+'('+money+')\\s*$','i');
  const items=[];
  for(const line of String(text||'').split(/\r?\n/)) {
    const match=row.exec(line.trim());
    if(!match)continue;
    const quantity=Number(match[1].replace(',','.')),description=match[3].trim();
    const unitPrice=parseAmount(match[4]),lineAmount=parseAmount(match[5]);
    if(!Number.isFinite(quantity)||quantity<=0||quantity>1000000||!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(description)||unitPrice===null||unitPrice<0||lineAmount===null||lineAmount<0)continue;
    let unit=(match[2]||'').toLowerCase();
    if(/^(?:un|und|unidad|unidades)$/.test(unit))unit='un';
    else if(unit.endsWith('s'))unit=unit.slice(0,-1);
    items.push({description,quantity,unit,unit_price:unitPrice,line_amount:lineAmount});
    if(items.length===200)break;
  }
  return items;
}

export function extractReceiptData(text) {
  text=String(text||'').slice(0,100000);
  const normalized=normalizeText(text), lines=text.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const ruc=findSupplierRUC(text,normalized);
  const provider=findProvider(lines,normalized,ruc);
  const subtotal=labeledAmount(text,['SUB\\s*TOTAL','OP(?:ERACI[ÓO]N)?\\.?\\s*GRAVADA','VALOR\\s+DE\\s+VENTA','BASE\\s+IMPONIBLE']);
  const igv=labeledAmount(text,['I\\.?G\\.?V\\.?']);
  const total=labeledAmount(text,['IMPORTE\\s+TOTAL','TOTAL\\s+A\\s+PAGAR','MONTO\\s+TOTAL','TOTAL\\s+GENERAL','TOTAL']);
  const warnings=[];
  const items=extractLineItems(text);
  if (!ruc) warnings.push('RUC no identificado o sin checksum válido.');
  if (total===null) warnings.push('No se identificó un total explícito.');
  if (subtotal!==null && igv!==null && total!==null && Math.abs(round2(subtotal+igv)-total)>0.05) warnings.push('Subtotal e IGV no coinciden con el total.');
  for(const item of items) {
    if(!item.unit)warnings.push('Revisa la unidad de compra de '+item.description+'.');
    if(Math.abs(round2(item.quantity*item.unit_price)-item.line_amount)>0.05)warnings.push('Revisa cantidad, precio, descuentos e impuestos de '+item.description+'.');
  }
  return {provider,ruc:ruc||'',number:findReceiptNumber(text,''),date:findReceiptDate(text),subtotal,igv,total,
    currency:/\bUSD\b|US\$|\bD[ÓO]LARES\b/i.test(text)?'USD':/S\/|\bPEN\b|\bSOLES\b/i.test(text)?'PEN':'',items,rawText:text,warnings};
}
export {isValidRUC,isISODate,parseProviderJSON};
