const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const htmlPath = path.join(__dirname, 'GUIA_BALANZAS_RECOMENDADAS.html');
const pdfPathRoot = path.join(__dirname, '..', 'GUIA_BALANZAS_RECOMENDADAS.pdf');
const backupDir = path.join(__dirname, '..', 'respaldos_delivery');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}
const pdfPathBackup = path.join(backupDir, 'GUIA_BALANZAS_RECOMENDADAS.pdf');

console.log('📄 Generando PDF de la Guía de Balanzas Recomendadas...');

const args = [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  `--print-to-pdf=${pdfPathRoot}`,
  `file:///${htmlPath.replace(/\\/g, '/')}`
];

execFile(chromePath, args, (err) => {
  if (err) {
    console.error('Error al generar PDF con Chrome:', err);
    return;
  }
  
  // Copiar al directorio de respaldos
  try {
    fs.copyFileSync(pdfPathRoot, pdfPathBackup);
  } catch (e) {}

  console.log('✅ ¡PDF GENERADO CON ÉXITO EN SU COMPUTADORA!');
  console.log('📁 Ubicación 1:', pdfPathRoot);
  console.log('📁 Ubicación 2:', pdfPathBackup);
});
