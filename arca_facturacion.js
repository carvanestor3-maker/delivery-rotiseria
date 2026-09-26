// ==========================================================================
// FACTURACIÓN ELECTRÓNICA - CONEXIÓN DIRECTA A ARCA (ex AFIP)
// ==========================================================================
// Este módulo habla DIRECTO con los webservices oficiales de ARCA (WSAA +
// WSFEv1) usando la librería `facturajs`. El certificado y la clave privada
// NUNCA salen de este servidor ni pasan por ningún servicio de terceros -
// se usan localmente solo para firmar el pedido de autorización (CMS) que
// exige ARCA, tal cual se decidió expresamente.
//
// Configuración (variables de entorno en Render):
//   ARCA_CUIT            CUIT del negocio (sin guiones), obligatorio
//   ARCA_PUNTO_VENTA     Número de punto de venta habilitado para Web Service
//   ARCA_CERT_PATH       Ruta al certificado (.crt/.pem) - ej: un "Secret File" de Render
//   ARCA_KEY_PATH        Ruta a la clave privada (.key) - ej: un "Secret File" de Render
//   ARCA_PRODUCTION      "1" para producción, cualquier otro valor (o vacío) usa homologación (testing)
//   ARCA_CONDICION_IVA   Texto informativo para la factura impresa (default: "Monotributo")
// ==========================================================================

const fs = require('fs');
const path = require('path');
const { AfipServices } = require('facturajs');
const QRCode = require('qrcode');

const CUIT = process.env.ARCA_CUIT ? parseInt(String(process.env.ARCA_CUIT).replace(/\D/g, '')) : null;
const PUNTO_VENTA = process.env.ARCA_PUNTO_VENTA ? parseInt(process.env.ARCA_PUNTO_VENTA) : null;
const CERT_PATH = process.env.ARCA_CERT_PATH || '';
const KEY_PATH = process.env.ARCA_KEY_PATH || '';
const PRODUCTION = process.env.ARCA_PRODUCTION === '1' || process.env.ARCA_PRODUCTION === 'true';
const CONDICION_IVA = process.env.ARCA_CONDICION_IVA || 'Monotributo';

const tokensCachePath = path.join(__dirname, 'arca_tokens_cache.json');

let afip = null;
let configError = null;

function isConfigured() {
  return !!afip;
}

function getConfigError() {
  return configError;
}

if (!CUIT || !PUNTO_VENTA || !CERT_PATH || !KEY_PATH) {
  configError = 'ARCA no está configurado todavía (faltan ARCA_CUIT, ARCA_PUNTO_VENTA, ARCA_CERT_PATH y/o ARCA_KEY_PATH en las variables de entorno).';
  console.warn(`⚠️ [Facturación ARCA] ${configError}`);
} else if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  configError = `ARCA no está configurado: no se encontró el certificado o la clave privada en las rutas indicadas (${CERT_PATH} / ${KEY_PATH}).`;
  console.warn(`⚠️ [Facturación ARCA] ${configError}`);
} else {
  try {
    afip = new AfipServices({
      homo: !PRODUCTION,
      cacheTokensPath: tokensCachePath,
      tokensExpireInHours: 12,
      certPath: CERT_PATH,
      privateKeyPath: KEY_PATH
    });
    console.log(`✅ Facturación ARCA configurada (CUIT ${CUIT}, Punto de Venta ${PUNTO_VENTA}, entorno: ${PRODUCTION ? 'PRODUCCIÓN' : 'homologación/testing'}).`);
  } catch (e) {
    configError = `Error al inicializar la conexión con ARCA: ${e.message}`;
    console.error(`⚠️ [Facturación ARCA] ${configError}`);
  }
}

// ---------------------------------------------------------------------
// Resolución dinámica del código de tipo de comprobante (Factura C, Tique
// C, etc.) - se consulta a ARCA en vez de "hardcodear" números de memoria,
// para no arriesgarse a mandar un código de comprobante incorrecto.
// ---------------------------------------------------------------------
let tiposCbteCache = null;
let tiposCbteCacheAt = 0;
const TIPOS_CBTE_CACHE_MS = 6 * 60 * 60 * 1000; // 6 horas

async function getTiposComprobante() {
  if (tiposCbteCache && (Date.now() - tiposCbteCacheAt) < TIPOS_CBTE_CACHE_MS) {
    return tiposCbteCache;
  }
  const result = await afip.execRemote('wsfev1', 'FEParamGetTiposCbte', {
    Auth: { Cuit: CUIT }
  });
  const lista = (result && result.ResultGet && result.ResultGet.CbteTipo) || [];
  tiposCbteCache = lista;
  tiposCbteCacheAt = Date.now();
  return lista;
}

async function resolveTipoComprobanteId(nombre) {
  const lista = await getTiposComprobante();
  const buscado = nombre.trim().toLowerCase();
  const match = lista.find(t => (t.Desc || '').trim().toLowerCase() === buscado)
    || lista.find(t => (t.Desc || '').trim().toLowerCase().includes(buscado));
  if (!match) {
    throw new Error(`ARCA no devolvió ningún tipo de comprobante que coincida con "${nombre}". Tipos disponibles: ${lista.map(t => t.Desc).join(', ')}`);
  }
  return match.Id;
}

function formatFechaArca(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// ---------------------------------------------------------------------
// Emitir un comprobante (Factura C o Tique C) para Monotributo: no
// discrimina IVA, el importe neto es igual al total.
// ---------------------------------------------------------------------
async function emitirComprobante({ tipoNombre, docTipo, docNro, importeTotal }) {
  if (!isConfigured()) {
    throw new Error(configError || 'ARCA no está configurado.');
  }
  if (!importeTotal || importeTotal <= 0) {
    throw new Error('El importe a facturar debe ser mayor a 0.');
  }

  const cbteTipo = await resolveTipoComprobanteId(tipoNombre);

  const ultimo = await afip.getLastBillNumber({
    Auth: { Cuit: CUIT },
    params: { PtoVta: PUNTO_VENTA, CbteTipo: cbteTipo }
  });
  const siguienteNumero = (ultimo.CbteNro || 0) + 1;

  // DocTipo 99 = Consumidor Final sin identificar (DocNro debe ser 0).
  // DocTipo 96 = DNI, cuando sí se identifica al cliente.
  const finalDocTipo = docNro ? (docTipo || 96) : 99;
  const finalDocNro = docNro ? parseInt(String(docNro).replace(/\D/g, '')) : 0;

  const importeRedondeado = Math.round(importeTotal * 100) / 100;
  const fecha = formatFechaArca();

  const resultado = await afip.createBill({
    Auth: { Cuit: CUIT },
    params: {
      FeCAEReq: {
        FeCabReq: { CantReg: 1, PtoVta: PUNTO_VENTA, CbteTipo: cbteTipo },
        FeDetReq: {
          FECAEDetRequest: {
            DocTipo: finalDocTipo,
            DocNro: finalDocNro,
            Concepto: 1, // 1 = Productos (venta de bienes)
            CbteDesde: siguienteNumero,
            CbteHasta: siguienteNumero,
            CbteFch: fecha,
            ImpTotal: importeRedondeado,
            ImpTotConc: 0,
            ImpNeto: importeRedondeado,
            ImpOpEx: 0,
            ImpIVA: 0,
            ImpTrib: 0,
            MonId: 'PES',
            MonCotiz: 1
          }
        }
      }
    }
  });

  const detalle = resultado && resultado.FeDetResp && resultado.FeDetResp.FECAEDetResponse
    ? resultado.FeDetResp.FECAEDetResponse[0]
    : null;

  if (!detalle || detalle.Resultado !== 'A' || !detalle.CAE) {
    const observaciones = detalle && detalle.Observaciones
      ? JSON.stringify(detalle.Observaciones)
      : (resultado && resultado.Errors ? JSON.stringify(resultado.Errors) : 'Sin detalle de ARCA.');
    const err = new Error(`ARCA rechazó el comprobante: ${observaciones}`);
    err.arcaResponse = resultado;
    throw err;
  }

  return {
    tipo_comprobante_nombre: tipoNombre,
    tipo_comprobante_id: cbteTipo,
    punto_venta: PUNTO_VENTA,
    numero_comprobante: siguienteNumero,
    fecha_emision: fecha,
    doc_tipo: finalDocTipo,
    doc_nro: finalDocNro,
    importe_total: importeRedondeado,
    cae: detalle.CAE,
    cae_vencimiento: detalle.CAEFchVto,
    cuit_emisor: CUIT,
    condicion_iva_emisor: CONDICION_IVA,
    homologacion: !PRODUCTION
  };
}

// ---------------------------------------------------------------------
// QR obligatorio en todo comprobante electrónico (RG 4892/2020 de AFIP/ARCA)
// ---------------------------------------------------------------------
async function generarQRDataUrl(factura) {
  const payload = {
    ver: 1,
    fecha: `${factura.fecha_emision.substring(0, 4)}-${factura.fecha_emision.substring(4, 6)}-${factura.fecha_emision.substring(6, 8)}`,
    cuit: factura.cuit_emisor,
    ptoVta: factura.punto_venta,
    tipoCmp: factura.tipo_comprobante_id,
    nroCmp: factura.numero_comprobante,
    importe: factura.importe_total,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: factura.doc_tipo,
    nroDocRec: factura.doc_nro,
    tipoCodAut: 'E',
    codAut: parseInt(factura.cae)
  };
  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const url = `https://www.afip.gob.ar/fe/qr/?p=${base64}`;
  return QRCode.toDataURL(url, { margin: 1, width: 220 });
}

module.exports = {
  isConfigured,
  getConfigError,
  emitirComprobante,
  generarQRDataUrl,
  CUIT,
  PUNTO_VENTA,
  CONDICION_IVA
};
